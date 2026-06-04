---
title: Project Eternum S2
image: /assets/eternum/title.png
published: 2026-05-10
github: https://github.com/haroldDOTsh/eternum
kind: case
tags: Fabric, Server Systems, Twitch Integration, Performance
role: Sole engineer. Architecture, modular bootstrap, item engine, Twitch integration, and ops/observability.
stack: Java 21, Fabric 1.21.11, Gradle / Loom, Prometheus, Grafana, JUnit
mono: "#cdd3e0, #9fb0ca"
---

`Project Eternum (S2)` is a Java 21 Fabric mod targeting Minecraft `1.21.11`. Calling it a mod is technically true and practically misleading- I would classify it more as a custom server platform that happens to ship as a mod: gameplay systems, streamer specific items, Twitch crowd control, ingame guides and changelogs, player tools, moderation, and a real observability stack. It builds on my shared `sh.harold.creative` APIs for data, menus, messages, sound, metrics, and Fabric adapters instead of reinventing those inside every feature.

For scale: ~560 Java files, 100+ commits, and JUnit coverage spread across bootstrap, items, Twitch, guide, metrics, curation, and the streamer modules.

## The coolest thing in here: streamers can plug Twitch into the world

A streamer links their Twitch account and the world starts listening. Chat syncs in, and channelpoint redeems fire as actual gameplay- and there are a *lot* of redeems. The point is that chat stops being a window on a second monitor and becomes an input device for the server.

<div class="gallery">
  <figure>
    <img src="/assets/eternum/chatdemo.gif" alt="Twitch chat syncing into Minecraft">
  </figure>
  <figure>
    <img src="/assets/eternum/twitch-effects.gif" alt="List of Twitch redeems">
  </figure>
  <figure>
    <img src="/assets/eternum/twitch-effects-shader-demo.gif" alt="Twitch redeem triggering a shader effect">
  </figure>
  <figure>
    <img src="/assets/eternum/bindingandconfiguring.gif" alt="Streamer module binding and configuration menu">
  </figure>
</div>


The plumbing under that is Twitch EventSub, and the interesting part is that EventSub is not a polite, exactly-once delivery system. Reconnects can replay the same redemption, so wiring "redeem -> effect" naively means one channel-point spend can detonate twice. The fix is a small TTL idempotency cache (`TwitchEventSubEventCache`) keyed on the stable Twitch redemption ID: duplicate deliveries get swallowed, gameplay stays replay-safe, and the streamer never has to explain to chat why the lava redeem went off three times.

## At a glance

- Minecraft: `1.21.11` (Fabric)
- Toolchain: Java 21, Gradle/Loom
- Shared library: `sh.harold.creative` (data, menus, messages, sound, metrics, Fabric adapters)
- Posture: modular bootstrap with explicit module descriptors, phases, dependencies, and server/client separation

## Some cool things

### Farming tools

One of our streamers was a avid Hypixel Skyblock player, so a set of "Hypixel Styled Farming tools" was requested. It needed to be balanced: fast enough to feel special, but still constrained by direction, storage, durability, and survival cost.

<div class="gallery">
  <figure>
    <img src="/assets/eternum/fruity_tilling.png" alt="Fruitylicious tilling hoe tooltip">
  </figure>
  <figure>
    <img src="/assets/eternum/tilling-hoe-demo.gif" alt="Tilling hoe creating clean farmland rows">
  </figure>
  <figure>
    <img src="/assets/eternum/prisma-pump-demo.gif" alt="Prisma pump extending irrigated farm rows">
  </figure>
  <figure>
    <img src="/assets/eternum/not-a-builders-wand.png" alt="Totally original builder's stick tooltip">
  </figure>
</div>

### Wilswarm poisons

The poison items are weapon augments/consumables. I tried to use this request as an opportunity to improve the vanilla combat.

<div class="gallery">
  <figure>
    <img src="/assets/eternum/wilswarm-poison-demo.gif" alt="Applying a Wilswarm poison augment to a weapon">
  </figure>
  <figure>
    <img src="/assets/eternum/wilswarm_venom_poison.png" alt="Moth Venom tooltip">
  </figure>
  <figure>
    <img src="/assets/eternum/wilswarm_weakness_poison.png" alt="Weakness Poison tooltip">
  </figure>
</div>

## okay... why a mod and not a plugin?

Mostly a pragmatic decision. In iteration 1 of Project Eternum (Q4 2024), we learned that content creators play a lot. It was very hard to match development velocity to player progression velocity while still preserving a high level of quality. The decision to use Fabric for season 2 was mostly to allow for more tangental content- cooking, flying, additional mobs, more biomes. All while keeping the "central" content + story development progressing at a comfortable speed.  

## How it was built

It started as a plain Fabric scaffold. The first real "decision" was the modular bootstrap layer- module descriptors, phases, dependencies, an explicit server/client split- so that "add a feature" never meant "edit the one giant init method."

Since this kind of topological loader is something that I have used a lot previously (very elegant solution), I just copied it over from "buh" (previous live-service SMP project, see writeup entry), and adapted it a bit for a fabric-styled loader.


Standing up the `1.21.11` target meant a dedicated Gradle/Loom lane with remapped Fabric adapters and composite substitution against the shared library, so the mod and the library could move together without a publish-and-pray loop.

From there it was incremental: the item engine, then tooltip normalization on top of it, then factions, the hotbar/player menu, the Twitch effects, the ingame guide, chunk pregeneration, metrics, changelogs, curation, foraging, vanish. Player-facing UX got treated as part of the system- guide menus, recipe previews that render real stacks, changelog books, normalized item lore, and debug/cheat commands that ask before they do something irreversible. Ops got the same treatment: Prometheus/Grafana assets, chunkgen dashboards, bounded label cardinality, resource guardrails, and local observability docs, all treated as product surface.

## Things that were actually quite difficult

The Twitch dedup above was the first lesson, and it generalized: any unreliable upstream that drives gameplay needs deduping keyed on something the upstream guarantees is stable.

The persistent one was effect lifecycles across the client/server boundary. Screen effects, movement and input effects, temporary blocks, and the payloads that carry them all need a clear owner and a clear teardown, or you get effects that outlive whatever caused them. Most of the "Twitch effect" work turned out to be lifecycle work wearing a costume.

Item augmentation had a bit of a more subtle constraint. It can add stats and lore, but it can't silently erase the base game's identity, rarity, category, or tooltip semantics, so the item layer wraps vanilla instead of overwriting it. Recipe previews fall under the same honesty rule- they render real crafting stacks rather than explanatory placeholders, because a preview that lies about the shape is worse than no preview at all.


## Code worth pointing at (once source is released)

- `ModuleGraphResolver` - phase aware topological sort for modules; it catches duplicate IDs, missing dependencies, dependencies on a later phase, and cycles before anything boots. This is the same resolver pattern I run in `buh`, my live service SMP core- when a piece of plumbing earns its keep on one project, it's worth carrying.
- `TwitchEventSubEventCache` - the small TTL idempotency cache described above; it turns unreliable duplicate delivery into replay safe gameplay.
- `ChunkGenService` - pregeneration treated as an observable live workload, with budgets, pending requests, runtime samples, reports, metrics, and safety controls. This was built in tandem with the observability stack, so chunkgen is something you watch on a Grafana board.
- `FruityliciousActionPlanner` - a streamer module (convenience farming tools) that uses bounded BFS/row planning to keep a flashy ability predictable and survival costed, so "powerful" doesn't quietly become "free."
- `EternumCompatibilityHandshake` - current active work: a configuration-phase handshake that rejects missing or mismatched client pairing mods before gameplay begins, instead of letting a mismatch surface as a confusing bug ten minutes in.
