---
title: Fulcrum (v2) Network Framework
image: /assets/fulcrum/hero.png
published: 2026-06-17
github: https://github.com/haroldDOTsh/fulcrum
kind: case
tags: Paper, Velocity, Agones, Kafka, Distributed Systems
role: Sole engineer. Kernel ontology, control plane on a log substrate, data-authority model, two-layer session runtime, and the capability system.
stack: Java 26, Paper, Velocity, Agones, Kafka, Cassandra, PostgreSQL, Valkey
mono: "#b6c7d7, #7894b2"
---

Fulcrum is my attempt at a Minecraft network platform that does not fight its own infrastructure. The version I am building now is a complete ground-up rebuild, and it shares almost nothing with the first one except the name and the ambition. v1 was a toy- a registry that brokered "slots" onto shared Paper runtimes, a hand rolled message bus over Redis, and a player object that most features reached straight into. It ran. It also rebuilt a pile of infrastructure that already existed, and inherited every problem that comes with putting many games in one JVM. I learned a lot writing it, most of it about what not to do a second time.

v2 starts from a narrower premise: Fulcrum should own the platform boundary- placement, routing, capacity, data authority, content resolution, effects, traceability- and almost nothing else. An author declares what an experience *is*; the substrate decides where it runs and how its state moves.

## The hack we decided not to inherit

Out of 80% guesswork and 20% evidence, we can assume Hypixel ran many minigame matches inside one long-lived JVM. Several games, one process, and a bespoke system to keep them from stepping on each other. This was a reasonable call for roughly 2013. A fresh server JVM was slow to start, Bukkit took its sweet time loading a world, and machines were expensive enough that dedicating one to a single two-team match would have been absurd. So you amortized: keep one fat process warm and multiplex matches onto it.

The bill for that arrives later. One match's main thread stall becomes every co-located match's stall. Isolation between games turns into a classloader problem and a standing prayer that nobody leaks state across the slot boundary. And you end up hand building your own pool, warm buffer, placement, and rollout logic- which is to say, rebuilding a chunk of what Kubernetes already does, by hand, inside a Minecraft plugin.

The multiplexing wasn't really what anyone set out to build. It was a workaround for slow, expensive instances that stuck around long enough to start looking like architecture.

A lot of that has changed since then. Cloud got cheaper. Kubernetes and Agones give you fleets, warm buffers, allocation, health, and rollout- most of what that hand built controller was doing in the first place. Minestom exists and boots a server in a fraction of the time Bukkit needs. Paper in front of a warm fleet- and maybe, later, an AOT cache to make each boot cheaper- gets a fresh per-match JVM cheap enough that the multiplexing trick stops really paying for itself. So v2 takes the isolation boundary the platform is already trying to give you. The unit is the Pod. One Paper Instance runs exactly one Session. There's no in-JVM match multiplexing- that's a hard line for this version, and the module boundaries are set up so that adding it back would mean fighting against them.

## Startup cost: warm fleets, and a cache we're exploring

The reason pooling existed at all was cold start cost, so a one-Session-per-Instance approach has to answer for cold start rather than wave at it. The current answer is deliberately boring: prebooted warm Agones fleets. You keep a buffer of Ready Paper Instances per capacity class, allocate out of the buffer, and let Agones refill behind you. A player never waits on a JVM to start, because the JVM started a minute ago.

The optimization I keep coming back to on top of that is the JDK's AOT cache. A recent JDK can record the classes an application loads and links- and, since the method profiling work, the hot method profiles too- into an ahead-of-time cache, the Project Leyden line of work that grew out of AppCDS. For a fleet that boots the same Paper image thousands of times, shaving warmup off every start adds up in machine count. What makes it appealing is stability: an AOT cache only changes how fast the JVM gets going, not whether it ends up correct. It's a speedup you can switch off and still have the same server underneath.

The more aggressive option is CRaC- Coordinated Restore at Checkpoint, the OpenJDK project built on CRIU that snapshots an already warmed JVM and restores it almost instantly. On paper it's the bigger win: checkpoint a Paper Instance once it's warm, then restore on allocation instead of holding idle processes. I'm not planning on it, and the reason is the same stability concern from the other side. A checkpoint freezes open sockets, file handles, entropy sources, threads, and timers, and each of those needs a restore hook that does the right thing, or the process comes back subtly wrong in a way you don't catch until hours into a match. That's a lot of correctness risk to take on for a faster start, when a warm fleet plus an AOT cache seems to get most of the way there without freezing live state. So CRaC stays in the interesting-but-not-now pile.

## The kernel is small, and it stays small

The other thing v1 taught me is that a god object is a slowmotion disaster you author yourself. So the v2 kernel is deliberately tiny. These are the only concepts it is permitted to know:

```text
Subject, Session, Presence, Experience, Slot, Instance,
Pool, Route, Effect, Capability, Artifact, ResolvedManifest
```

Rank, punishment, party, guild, economy, chat- none of those are kernel concepts. They are *capabilities*: governed bundles that declare their own contracts, authorities, commands, events, projections, and effects, which the platform then materializes into real topics and workers. Core compiles and runs without a single capability installed. There is no central command enum, no global player object, and an architecture test that rejects `core -> rank` the instant someone introduces it. A Subject is an identity plus whatever capability projections attach to it. It has no `.rank` field, because the day it gets one is the day the kernel starts knowing about ranks, and a kernel that knows about ranks soon knows about everything.

## Everything canonical is a typed command to an authority

No host process holds database write credentials. That single constraint shapes the entire data layer, and it is the exact inverse of how v1 behaved, where any plugin holding a Mongo handle could write whatever it liked.

In v2, canonical state changes travel as typed commands to authorities. An authority consumes commands from the log, validates them, applies idempotency and partition fencing and a revision check, writes its projections, and emits events plus a result. The log is the durable spine; the stores are projections off it; Kafka can always redeliver, which is the reason every cross boundary command has to be idempotent.

```text
Kafka KRaft   command, event, and state spine; the source of truth
Cassandra     hot projections: presence, live routes, session checkpoints
PostgreSQL    relational system of record: history, audit, migrations
Valkey        cache, idempotency dedupe, leases, short-lived coordination
Object store  immutable artifacts, templates, cold realm snapshots
```

Host runtimes and experience code emit commands, read the projections they are allowed to read, and run host-local effects. They do not write canonical stores, do not create their own tables, and do not assert arbitrary identities. The commands, events, projections, and the DDL behind them all come from contract declarations through code generation, not from handwritten `Map<String, Object>` payloads. A capability author writes a record; the build produces the typed client, the serializer, the topic, the projection writer, the migration, and the test fixtures. The contract is meant to be the only thing written by hand. Everything downstream is generated from it, because the alternative is fourteen slightly different definitions of the same event drifting apart over a year.

## The session runtime is two layers

A Session runs as a pure reducer wrapped in a Paper-bound shell. The reducer is a host neutral functional core: it takes meaningful domain events and the current state and returns new state plus a list of effects. It is not allowed to import Paper, Bukkit, Velocity, or any Minecraft server class- an architecture test enforces that- which means it is testable without a server and replayable straight from the log.

The tick runtime is the imperative shell that actually touches Paper. The split that matters is which behavior crosses a platform boundary and which stays home:

```text
Local Paper behavior   cancel a block break, spawn particles, play a sound,
                       apply knockback, run local combat logic
Platform effect        route a Subject, grant a reward, write stats,
                       checkpoint a realm, emit an authority command
```

Most of a minigame lives in the first column, and v2 does not force it through an abstraction it does not need. Because one Instance hosts exactly one Session, local Paper code is allowed to stay local Paper code. Effects exist only for the things that have to leave the Pod, and the reducer is forbidden from blocking the tick while it waits for one to settle. You emit the command and keep ticking; the result returns later as another event.

## Code is pushed, content is pulled

Compiled code ships through the fleet rollout. Maps, rotations, kits, loot tables, shop contents, and every operator-tunable number do not. Those are content, pulled and pinned into a ResolvedManifest at placement time- the exact set of code, content, config, contracts, and capability versions chosen for one Session. The test for which is which is simple: if changing a thing should not require a code rollout, it is content, and hardcoding it into a compiled artifact is a bug. v1 had map ids sitting in source. I am not doing that twice.

## The idea underneath

The idea underneath all of it is fairly small. The hard parts of running a Minecraft network- scheduling, allocation, warm capacity, a durable change log- were mostly solved years ago by people who weren't thinking about Minecraft at all. v1 tried to resolve them and mostly lost. v2 leans on that existing infrastructure instead, and spends what it saves on the part that's actually specific to this domain: the contracts that turn a player pressing /play into a Session on a Pod that nobody had to place by hand.

*Fulcrum is in progress and actively being worked on.*