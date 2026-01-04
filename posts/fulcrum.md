---
title: Fulcrum Network Framework
image: /assets/fulcrum/hero.png
published: 2025-06-26
github: https://github.com/haroldDOTsh/fulcrum
---

Fulcrum is my “write (almost) everything in house” Minecraft network project. It is heavily inspired by Hypixel’s ecosystem, but built on modern Paper and Velocity rather than legacy 1.7-era constraints. It’s a systems design lab that also functions as an actual platform: registry, proxy, and runtime processes that coordinate through typed messaging, shared data primitives, and explicit lifecycle rules.

## At a glance
- Minecraft: 1.21.10/11 (Paper + Velocity)
- Toolchain: Java 21, Gradle 9.2
- Dependencies (runtime): Citizens2, FAWE
- Processes: registry service, one or more proxies, any number of backend runtimes

## What Fulcrum is trying to solve
A lot of Minecraft “networks” are a constellation of plugins that each invent their own data model, their own caching strategy, and their own operational tooling. It works, until it doesn’t: latency spikes from database chatter; inconsistent or inefficient player state between proxy and backend; hard to debug routing; feature flags scattered across config files; gameplay logic mixed with infrastructure cleanup.

Fulcrum’s answer is to treat the network like a product platform:
- clear boundaries between control plane, proxy layer, and runtime backends
- typed, traceable communication between processes
- a consistent system for data (hot in memory, durable when it matters)
- a minigame engine that makes “spinning up another match” a routine operation, not a bespoke script

## System map
| Layer | Runs as | Responsibilities |
|------:|--------|------------------|
| Registry (control plane) | Standalone JVM | registration, heartbeats, slot orchestration, routing updates, maintenance intent |
| Proxy layer | Velocity Plugin | player routing pipeline, parties, friends, privacy gates, status and MOTD, moderation entry points |
| Runtime backends | Paper plugin | feature bootstrap, player session cache, UI, worlds/NPC tooling, minigame hosting |
| Shared primitives | common modules | Data API, typed message bus, localization, cooldowns, diagnostics conventions |

## Core ideas that make the platform “hang together”
### Environment driven bootstrap
Servers decide what they are by reading an `ENVIRONMENT` file plus `environment.yml`. That single decision gates bootstrap, feature activation (enviornment specific plugins/features), and the role the instance registers under. The same `/plugins` folder can boot as different server types without repackaging.

### Typed messaging as the spine
Cross service communication is a typed message bus: envelopes, codecs, channel constants, lifecycle hooks. The goal is predictable coordination: routing updates, rank mutations, session events, maintenance broadcasts, and registry announcements all speak the same dialect.

### A pragmatic data model (hot sessions, durable storage)
Fulcrum keeps player state hot while a player is online, synchronizes deltas through the bus, and persists to canonical storage at the correct boundaries instead of on every click.

A three way storage strategy:
- Redis: ephemeral session cache, message bus transport, registry metadata
- MongoDB: long-term player documents and evolving JSON-like content structures
- PostgreSQL: structured assets and indexed records (world templates, POIs, match logs, audit tables)

### Slot orchestration: the network’s heartbeat
Instead of thinking “a server runs one game”, Fulcrum treats a runtime as capacity that can host multiple logical slots. The registry brokers capacity; the runtime provisions, runs, tears down, and reports state; the proxy routes players into the right slot.

Provisioning and match lifecycle are first class operations, with explicit state and observability.

## Minigame provisioning pipeline (high level)
```text
Player runs /play
  -> Velocity proxy records intent and sends request to registry
  -> Registry searches for available backend advertising the requested slot family/variant
  -> If none are free, registry issues a provision request
  -> Runtime slot orchestrator reserves capacity and asks the minigame engine to initialize a slot
  -> Engine claims a world template, pastes it, registers POIs, activates the state machine
  -> Registry broadcasts routing info back to proxies
  -> Velocity transfers queued players into the freshly prepared arena
```
## Content pipeline: worlds and content as data, not folders
A Minecraft network lives or dies on content (map) iteration. Fulcrum’s approach is to treat maps like versioned assets with metadata, not hand maintained/deployed worlds.

At a high level:
- **Templates** are distributed as schematics and cached locally per runtime.
- A runtime can **create or reset** a world from a known template in a consistent way.
- **POIs** are extracted from markers and registered into a central POI registry.
- **Props** and **NPCs** are spawned as structured instances that can be cleaned up deterministically.
- World tooling is exposed via commands so the pipeline is debuggable in live environments.

## Template ingestion and caching
Templates are loaded into a runtime managed cache. The “shape” of the cache is intentionally boring: deterministic file layout and explicit origin markers.

The practical properties I care about here:
- Templates can be updated without bricking older matches.
- A runtime can validate “is this schematic usable?” before it tries to paste.
- Pasting is async and observable.

## Provisioning a playable world
When a minigame slot needs a world, the runtime does the following sequence:
- Create a world with a **void generator**.
- Paste the template via **FAWE**, optionally copying entities and biomes depending on the template’s expectations.
- Set spawn/origin based on configured markers.
- Extract POIs and register them so gameplay code never has to “scan blocks” mid match.


## POIs, props, and “content as runtime state”
This leads us into the next thing- Fulcrum’s POI system is designed to be a wiring layer:
- POIs are registered with handlers.
- A POI activation bus can drive systems like NPC placement, prop placement, general points on map, or game specific triggers.
- Props are tracked as instances with placement options and cleanup rules so teardown is deterministic.

The consistent theme is that everything placed into the world is either:
- a template artifact, or
- a tracked instance that can be cleaned up without guessing.

## Where the code lives
Fulcrum is split into a small number of modules to keep “platform plumbing” separate from runtime/game specifics:

- `common-api`: shared contracts and APIs (settings, message interfaces, shared primitives)
- `common-api:message`: message facade and localization-friendly message primitives
- `runtime`: Paper runtime (feature bootstrap, world tooling, NPC/dialogue, minigame hosting)
- `runtime-velocity`: Velocity proxy layer (routing, social features, control-plane clients)
- `registry-service`: standalone control plane process (registration, heartbeats, orchestration, routing)

---

## Full surface area (high level inventory)

> This is the platform breadth map. It is intentionally wide; the goal is to communicate scope without turning the top of the page into a shopping list.

  ### Platform and lifecycle
  - Environment driven module system (bootstrap gating, environment file reader, environment config parser)
  - Runtime and proxy feature managers, dependency container, service locator pattern
  - Command registrar (Paper Brigadier) plus Velocity command wiring
  - Module metadata and list commands; runtime info commands
  - Server lifecycle hooks, server id generation, join message feature

  ### Backend and registry services
  - Registry service core with interactive console and command suite
  - Registration pipeline with server and proxy identifiers, lifecycle state machine, heartbeat monitor
  - Slot orchestration: logical slot store, capacity reservation scripts, routing updates, occupancy tracking
  - Environment directory and network config profile management (Mongo defaults, Redis cache, broadcast updates)
  - Maintenance coordination and shutdown intent management
  - Rank mutation service, punishment service, friend graph service, session log repository with dead session sweeper

  ### Data and storage
  - Data API with documents, collections, patches, queries, and transactions
  - Storage backends for Mongo and JSON plus connection adapters
  - Session-backed player cache; player session records; playtime tracking; cooldown registry
  - Translation repository and translation cache storage
  - PostgreSQL migrations for assets and logs (world maps, props, sessions, match logs, participants, rank audit)
  - Redis scripts and caches for ids, slots, routing, and social data

  ### Messaging and localization
  - Message bus API with typed envelopes, codecs, channel constants, lifecycle hooks
  - Message facade with styles, icons, tags, debug tiers, locale resolution, builder API
  - Translation bundles with cache, refresh command, and Mongo repository
  - Runtime, Velocity, and registry adapters with debug commands
  - Generic response payloads and descriptor plumbing for typed responses

  ### Proxy layer (Velocity)
  - Player routing pipeline with play, lobby, rejoin, manual route commands
  - Slot family advertising, server lifecycle reporting, proxy shutdown handling
  - Party system (invites, roster, settings, reservations, locks, Redis store, formatting)
  - Friends and ignores (commands, rendering, snapshots)
  - Privacy gates, rank service, punishment flow, maintenance mode, status service, MOTD
  - Network config, environment directory, session service, data API, message bus, cooldown features

  ### Runtime core (Paper)
  - Runtime bootstrap, feature manager, dependency container, command registrar
  - Environment routing and network config features; message feature with locale resolver
  - Player data features: settings service, player directory, privacy signals, friend snapshots
  - Session services: reservations, session logs, session cache integration
  - Rank feature and utilities; status broadcasts; join message features
  - Slot presence feature, orchestrator integration, shutdown and evacuate flows

  ### Gameplay and minigame engine
  - Minigame engine feature with GameManager, slot provisioning, reservation handling
  - State machine framework with blueprints, contexts, transitions, default match phases
  - Team planning, roster manager, match damage and spectator listeners, routing listeners
  - Match telemetry: log writer, history writer, participant tracking, session tagging
  - Minigame data registry with Mongo-backed collections
  - Debug minigame feature and state machine tooling commands

  ### World and content tooling
  - World service and world manager with FAWE-based schematic pasting
  - Map template cache with origin markers, POI extraction, checksum tracking
  - Prop system with placement options, instances, cleanup
  - POI registry with handlers, activation bus, integration with props and maps
  - Void chunk generator and world status tooling
  - World command suite (list, info, POIs, debug paste)

  ### NPC and dialogue
  - NPC registry with validated definitions, profiles, options, poses, equipment
  - Citizens adapter and NMS abstraction for NPC handles
  - POI driven NPC orchestrator, interaction listener, viewer service
  - NPC skin cache service with HTTP fetch and in-memory caching
  - Dialogue service with sessions, callbacks, cooldowns, menu hooks
  - NPC debug commands and definition validator

  ### Social and communication
  - Chat channel service with global, party, staff switching
  - Direct message service with reply and quick message commands, privacy checks
  - Chat formatting, emoji service, emoji pack persistence
  - Player directory presence and activity lookups; rank formatted names
  - Friend snapshots and block lists; invites; ignore enforcement
  - Privacy API with domains, setting levels, deny reasons

  ### Moderation and staff
  - Punishment records, effects, snapshots, ladder state stored through registry
  - Punish, pardon, appeal commands; broadcast features
  - Action flag system with contexts, overrides, presets, events
  - Staff vanish service and utilities (sudo, loop, locate player)
  - Gamemode feature and staff fun tools

  ### UI and UX
  - Menu toolkit with builder, list menus, tabbed menus, virtual grids
  - Menu instance registry with caching and refresh support
  - Menu debug commands and live supplier-based menus
  - Scoreboard system with modules, rendering pipeline, title manager, flash task
  - NMS scoreboard packet renderer (1.21) with adapter abstraction
  - Minecraft font loader and custom font data support

  ### Commands and operational tooling
  - Registry console commands (backend registry, proxy registry, slots, status, locate player)
  - Provisioning commands (minigame and slot provisioning, debug pipeline)
  - Environment directory and network config CLI commands
  - Runtime commands (chat, dm, emojis, world tools, state machine, message debug, npc debug)
  - Proxy commands (play, lobby, rejoin, party, friend, ignore, punish, appeal, pardon)
  - Module list and runtime info commands

  ### Testing and diagnostics
  - Registry integration tests (Redis routing, allocation, registry inspection)
  - Data API tests (documents, patches, backends, transactions)
  - Runtime tests (NPC validation, teams, chat/emoji, direct messages)
  - Velocity tests (friend service, rank service, MOTD formatting)
  - Debug fixtures for menu toolkit, minigame pipeline, message bus