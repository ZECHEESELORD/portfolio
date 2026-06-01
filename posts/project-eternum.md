---
title: Project Eternum
image:
published: 2026-06-01
github:
---

`Project Eternum (S2)` is a Java 21 Fabric mod targeting Minecraft `1.21.11`. Calling it a mod is technically true and practically misleading- I would classify it more as a custom server platform that happens to ship as a mod: gameplay systems, streamer specific items, Twitch crowd control, ingame guides and changelogs, player tools, moderation, and a real observability stack. It builds on my shared `sh.harold.creative` APIs for data, menus, messages, sound, metrics, and Fabric adapters instead of reinventing those inside every feature.

For scale: ~560 Java files, 100+ commits, and JUnit coverage spread across bootstrap, items, Twitch, guide, metrics, curation, and the streamer modules.

## The coolest thing in here: streamers can plug Twitch into the world

A streamer links their Twitch account and the world starts listening. Chat syncs in, and channelpoint redeems fire as actual gameplay- and there are a *lot* of redeems. The point is that chat stops being a window on a second monitor and becomes an input device for the server.

The plumbing under that is Twitch EventSub, and the interesting part is that EventSub is not a polite, exactly-once delivery system. Reconnects can replay the same redemption, so wiring "redeem -> effect" naively means one channel-point spend can detonate twice. The fix is a small TTL idempotency cache (`TwitchEventSubEventCache`) keyed on the stable Twitch redemption ID: duplicate deliveries get swallowed, gameplay stays replay-safe, and the streamer never has to explain to chat why the lava redeem went off three times.

## At a glance

- Minecraft: `1.21.11` (Fabric)
- Toolchain: Java 21, Gradle/Loom
- Shared library: `sh.harold.creative` (data, menus, messages, sound, metrics, Fabric adapters)
- Posture: modular bootstrap with explicit module descriptors, phases, dependencies, and server/client separation

## Why it's a platform, not a feature mod

Most mods pick a lane- one mechanic, done well. Eternum is structured the other way around: a bootstrap layer that brings up many modules in a defined order, each declaring what it is and what it depends on, with server and client concerns kept on separate sides of the line. Features are families, not one-offs: an item engine and tooltip normalization, factions, a hotbar and player menu, the Twitch effects, an in-game guide, chunk pregeneration, metrics, changelogs, curation, foraging, vanish. The shared library carries the boring-but-load-bearing parts so feature code can stay about the feature.

## How it was built

It started as a plain Fabric scaffold. The first real decision was the modular bootstrap layer- module descriptors, phases, dependencies, an explicit server/client split- so that "add a feature" never meant "edit the one giant init method."

Early on I built a photo/camera/gallery system, debugged it, got it working, and then deleted it when photo ownership moved to an external mod. I'm listing the deletion on purpose: cutting working code because the responsibility belongs somewhere else is unfortunately something that just needs to get done.

Standing up the `1.21.11` target meant a dedicated Gradle/Loom lane with remapped Fabric adapters and composite substitution against the shared library, so the mod and the library could move together without a publish-and-pray loop.

From there it was incremental: the item engine, then tooltip normalization on top of it, then factions, the hotbar/player menu, the Twitch effects, the in-game guide, chunk pregeneration, metrics, changelogs, curation, foraging, vanish. Player-facing UX got treated as part of the system rather than a coat of paint- guide menus, recipe previews that render real stacks, changelog books, normalized item lore, and debug/cheat commands that ask before they do something irreversible. Ops got the same treatment: Prometheus/Grafana assets, chunkgen dashboards, bounded label cardinality, resource guardrails, and local observability docs, all treated as product surface instead of an afterthought.

## Things that were actually hard

The Twitch dedup above was the first lesson, and it generalized: any unreliable upstream that drives gameplay needs deduping keyed on something the upstream guarantees is stable.

The persistent one was effect lifecycles across the client/server boundary. Screen effects, movement and input effects, temporary blocks, and the payloads that carry them all need a clear owner and a clear teardown, or you get effects that outlive whatever caused them. Most of the "Twitch effect" work turned out to be lifecycle work wearing a costume.

Item augmentation had a quieter constraint. It can add stats and lore, but it can't silently erase the base game's identity, rarity, category, or tooltip semantics, so the item layer wraps vanilla instead of overwriting it. Recipe previews fall under the same honesty rule- they render real crafting stacks rather than explanatory placeholders, because a preview that lies about the shape is worse than no preview at all.

And then there was packet vanish, which sat right on the hot server movement paths. Profiling the overhead is what pushed it toward direct lifecycle binding and fast short-circuits, instead of doing work on every movement tick.

## Code worth pointing at

- `ModuleGraphResolver` - phase aware topological sort for modules; it catches duplicate IDs, missing dependencies, dependencies on a later phase, and cycles before anything boots. This is the same resolver pattern I run in `buh`, my live service SMP core- when a piece of plumbing earns its keep on one project, it's worth carrying.
- `TwitchEventSubEventCache` - the small TTL idempotency cache described above; it turns unreliable duplicate delivery into replay safe gameplay.
- `ChunkGenService` - pregeneration treated as an observable live workload, with budgets, pending requests, runtime samples, reports, metrics, and safety controls. This was built in tandem with the observability stack, so chunkgen is something you watch on a Grafana board, not something you start and hope.
- `FruityliciousActionPlanner` - a streamer module (convenience farming tools) that uses bounded BFS/row planning to keep a flashy ability predictable and survival costed, so "powerful" doesn't quietly become "free."
- `EternumCompatibilityHandshake` - current active work: a configuration-phase handshake that rejects missing or mismatched client pairing mods before gameplay begins, instead of letting a mismatch surface as a confusing bug ten minutes in.

## Where it's heading

Active direction is the compatibility handshake plus async and cache hardening around connection safety, factions, metrics, player data, and GooddayMK summon state. Less new surface, more making the existing surface behave when real people and bad networks show up.
