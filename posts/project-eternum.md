---
title: Project Eternum S2
image: /assets/eternum/title.png
published: 2026-05-10
github: https://github.com/haroldDOTsh/eternum
kind: case
tags: Fabric, Server Systems, Twitch Integration, Performance
role: Sole engineer.
stack: Java 21, Fabric 1.21.11, Gradle / Loom, Prometheus, Grafana, JUnit
mono: "#cdd3e0, #9fb0ca"
---

`Project Eternum (S2)` is a private Minecraft `1.21.11` Fabric server built for a group of streamers. It contains the usual custom server machinery, plus streamer specific features, Twitch crowd control, ingame guides and changelogs, moderation tools, and actual Grafana dashboards because apparently virtual nekomimi need observability.



## Twitch can touch the world

A streamer links their Twitch account and the server begins consuming EventSub. Chat appears ingame. Channel point redeems become gameplay events: effects, temporary blocks, movement changes, shaders, and whatever else seemed funny enough to implement.

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



## Things players use

### Farming tools

One streamer had played a lot of Hypixel SkyBlock and requested appropriately excessive farming gear. The tools till rows, place water, and build from stored materials. Their reach is bounded by direction, durability, inventory, and survival cost, so the flashy part still belongs inside the economy.

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

`FruityliciousActionPlanner` handles the bounded row and BFS behind those tools. Planning happens before mutation, which keeps the action predictable and makes pricing the exact affected blocks straightforward.

### Wilswarm poisons

Wilswarm poisons are consumable weapon augments. They add effects and tooltip state while preserving the base item's identity, rarity, and category. The item layer wraps the vanilla stack and carries the augmentation beside it.

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


## Why season 2 moved to Fabric

Season 1 ran as a plugin project in late 2024. The creators played faster than I could build polished content. Every week spent on the main progression path created demand for another week of side content.

Fabric gave season 2 more room. Cooking, flying, mobs, biomes, client effects, and paired client/server features can exist without squeezing every idea through the vanilla protocol surface. The main story can move at a sane pace while smaller modules keep the server fresh.

However, using Fabric also brought operational work that didn't exist with Paper. Eternum does require a client pairing mod for further gameplay integration. That cost has been worthwhile for this server.

## The bugs that consumed the time

Duplicate EventSub delivery was easy to spot. Effect teardown kept returning.

Screen shaders, movement changes, temporary blocks, and input effects cross the client/server boundary and outlive a single callback. Each effect needs an owner, an expiry, and a cleanup path for logout, world change, module disable, and failed payload delivery. Most Twitch work eventually became lifecycle work wearing a costume.

Client pairing caused its own failures. The current `EternumCompatibilityHandshake` runs during configuration and rejects missing or mismatched pairing mods before the player enters the world. A clean rejection during login is much nicer than discovering ten minutes later that one client effect silently vanished.

Chunk generation is a long-running workload inside a live server. `ChunkGenService` exposes pending requests, budgets, runtime samples, reports, and metrics. I can see it misbehaving before a streamer discovers the issue by losing TPS on camera. Good observability is partly engineering and partly avoiding public embarrassment.

## Code worth opening once the source is released

- `ModuleGraphResolver`: phase-aware topological sorting and bootstrap validation, shared with `buh`.
- `TwitchEventSubEventCache`: TTL deduplication keyed by Twitch redemption ID.
- `ChunkGenService`: bounded pregeneration with reports, metrics, and operator controls.
- `FruityliciousActionPlanner`: bounded planning for the farming tools.
- `EternumCompatibilityHandshake`: configuration-phase client pairing checks.

The source is still private for now.
