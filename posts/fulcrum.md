---
title: Fulcrum (v2) Network Framework
image: /assets/fulcrum/hero.png
published: 2026-06-17
github: https://github.com/haroldDOTsh/fulcrum
kind: case
tags: Paper, Velocity, Agones, Kafka, Distributed Systems
role: Sole engineer.
stack: Java 26, Paper, Velocity, Agones, Kafka, Cassandra, PostgreSQL, Valkey
mono: "#b6c7d7, #7894b2"
---

Fulcrum is my second attempt at a Minecraft network platform. The first version worked just well enough to teach me which parts I had accidentally reinvented.

v1 brokered game slots onto shared Paper processes, moved messages through a hand-rolled Redis bus, and exposed one player object that every feature eventually reached into. It ran real code. It also coupled matches inside one JVM, made state ownership fuzzy, and gave me several exciting ways to build infrastructure that already existed elsewhere.

v2 is a ground-up rebuild. It handles placement, routing, capacity, data ownership, content versions, and cross-server effects. Game code gets a small host API and stays close to Paper.

## One match, one Paper process

Out of roughly 80% guesswork and 20% public evidence, I assume Hypixel historically multiplexed several minigame matches inside long-lived Bukkit processes. Around 2013, that was a sensible optimization. Fresh server JVMs started slowly, world loading was expensive, and wasting a whole process on a short match would have been painful.

Once several matches share a process, one main-thread stall hits all of them. Game isolation becomes a classloader and lifecycle problem. The network also needs custom pooling, warm capacity, placement, and rollout logic inside the Minecraft stack.

Today, Kubernetes and Agones provide fleets, health checks, allocation, warm buffers, and rollouts. Fulcrum uses that process boundary directly:

```text
One Paper Instance = One Session = One Pod
```

A Bed Wars match can leak, stall, or crash while the next six matches keep running in their own processes. Each instance has one session lifecycle and one resolved content manifest.

## Cold starts

A fresh JVM still takes time, so allocation comes from prebooted Agones fleets. Each capacity class keeps a configurable number of `Ready` Paper instances. Allocation removes one from the buffer and Agones refills it behind the player flow. The match process normally started before anybody asked for it.

I am also exploring the JDK AOT cache work that grew from AppCDS and Project Leyden. Fulcrum fleets boot the same Paper image repeatedly, which makes class and profile reuse unusually attractive. If the cache causes trouble, I can remove it without changing server behaviour.

CRaC offers a larger theoretical win by restoring a warmed JVM from a checkpoint. I am leaving it alone for now. Paper owns sockets, threads, file handles, timers, entropy sources, and native state; all of them need correct restore hooks. A warm fleet is boring and observable. Boring wins this round.

## A kernel I can still fit in my head

The v1 player object gradually learned about ranks, punishments, parties, chat, inventory, and whatever feature arrived next. That object became the dependency graph.

The v2 kernel knows a fixed set of concepts:

```text
Subject, Session, Presence, Experience, Slot, Instance,
Pool, Route, Effect, Capability, Artifact, ResolvedManifest
```

A `Subject` is an identity. Rank, punishment, party, guild, economy, and chat live in installable capabilities. Core builds and runs with zero capabilities installed.

`Subject` exposes identity only. Each capability owns its commands and events. An architecture test rejects imports such as `core -> rank`, and code generation produces the typed client and storage glue from the capability declaration.

This is less glamorous than discovering in two years that the kernel has opinions about guild chat formatting.

## Canonical writes go through authorities

Paper and Velocity hosts do not receive database write credentials. They submit typed commands to capability authorities over Kafka.

An authority validates the command, applies idempotency and partition fencing, checks the expected revision, writes its projections, then publishes events and a result. Kafka can redeliver, so every command crossing this boundary carries an idempotency key.

```text
Kafka KRaft   durable command, event, and state log
Cassandra     hot projections: presence, routes, session checkpoints
PostgreSQL    history, audit, relational records, migrations
Valkey        cache, deduplication, leases, short-lived coordination
Object store  immutable artifacts, templates, cold realm snapshots
```

Host code reads the projections it is allowed to read and emits commands for canonical changes. It cannot create a surprise table from inside a minigame plugin or write a forged subject ID directly into PostgreSQL.

Capability contracts are ordinary records. The build generates serializers, topic bindings, typed clients, projection writers, migrations, and test fixtures from those records. Keeping the contract in one place avoids maintaining several near-identical event definitions across Java, Kafka, Cassandra, and PostgreSQL.

## Session code has a pure core and a Paper shell

A session reducer accepts domain events plus current state and returns new state plus effects. Architecture tests keep Paper, Bukkit, Velocity, and Minecraft server classes out of that package. The reducer can be replayed from a log and tested without booting a server.

The tick runtime is the imperative shell. It owns ordinary Paper behavior and executes local effects:

```text
Local Paper behavior   cancel a block break, spawn particles, play a sound,
                       apply knockback, run combat logic

Platform effect        route a Subject, grant a reward, write stats,
                       checkpoint a realm, emit an authority command
```

Most minigame code stays in the first group. A block-break cancellation has no reason to visit Kafka. Anything that leaves the Pod becomes an effect, and the reducer keeps ticking while the result travels back as another event.

During debugging, I can replay the same event stream and expect the same session decisions. The Paper shell remains responsible for the messy physical world, where players and plugins continue inventing new edge cases.

## Versioning a session

Compiled code ships with the fleet image. Maps, rotations, kits, loot tables, shops, and operator-tunable values live as content artifacts.

Placement resolves those inputs into a `ResolvedManifest`: the exact code image, content bundle, config, contracts, and capability versions for one session. The manifest is pinned for the match lifetime and stored with its trace data.

v1 hardcoded map IDs in source. I am not doing that twice.

## Current state

Fulcrum v2 is active work. The repository contains the kernel model, capability contracts and generation, host runtimes, authority paths, session model, and deployment work as they are built out. Some pieces described here are still being completed and exercised together.

Agones allocates processes. Kafka preserves ordered changes. Fulcrum spends its custom engineering on Minecraft-specific contracts and player flow. v2 has fewer heroic ambitions and a better chance of working.
