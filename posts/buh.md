---
title: Live Service SMP Experience
image: /assets/buh/buh.png
published: 2025-11-23
github: https://github.com/ZECHEESELORD/buh
---

`buh` is the live service SMP core I run for my osu friends: one plugin that owns the server experience end to end. The intent is simple: ship features quickly without turning the server into a pile of unrelated mechanics.

This is production code in the only way that matters: real players; real menus; real item edge cases; real “why is this broken at 1am” debugging.

## Design goals:
- Live service as a priority- Features can be enabled, disabled, and iterated without rewriting the core.
- One data story- a slimmed down Data API (based on Fulcrum, another one of my projects) that keeps feature code storage agnostic.
- Sane migrations, staff audit trails, debug commands, and consistent output.
- Consistent Design- UI, items, and combat should feel cohesive and integrated, not a mish-mash of random plugin visuals.

## Why this is interesting:
Most SMP servers are a plugin salad. `buh` is closer to a platform:

- A **module system** with dependency ordering and a single activation flow.
- A **data layer** that supports document stores and migrations, allowing for easy implementation and consistent data access across features.
- A **gameplay stack** where items feed stats, stats feed combat, and everything is surfaced cleanly in menus, tab, and scoreboard.
- Packet side rendering when we want per player views.

## Highlights
**Modules**, **typed config**, **document Data API** (JSON/Nitrite/MySQL), **menus + UI framework**, **packet-side UX** (names + lore), **stats + custom combat**, **item engine** (PDC instances, abilities, enchants, durability), **economy + mobs**, **cosmetics + unlockables**, **staff tooling**.

## Picture Gallery

<div class="gallery">
  <figure>
    <img src="/assets/buh/player_directory.png" alt="Player directory">
  </figure>
  <figure>
    <img src="/assets/buh/player_profile.png" alt="Player profile">
  </figure>
  <figure>
    <img src="/assets/buh/level_brackets.png" alt="Level brackets">
  </figure>
  <figure>
    <img src="/assets/buh/level_menu.png" alt="Level menu">
  </figure>
  <figure>
    <img src="/assets/buh/stats_menu.gif" alt="Stats menu">
  </figure>
  <figure>
    <img src="/assets/buh/mace_item.png" alt="Mace item tooltip">
  </figure>
  <figure>
    <img src="/assets/buh/chat_format.gif" alt="Chat formatting preview">
  </figure>
  <figure>
    <img src="/assets/buh/transaction_ledger.png" alt="Transaction ledger">
  </figure>
  <figure>
    <img src="/assets/buh/server_reboot.png" alt="Server Reboot">
  </figure>
</div>

## Core subsystems
### Data and backend
- Storage-agnostic document API with async-first stages and snapshot updates.
- Store backends for JSON, Nitrite, and MySQL; virtual threads for I/O where appropriate.
- Migration suite for legacy JSON data and store migrations, plus admin commands.
- Ledger repositories for audit trails and item instance tracking.

### UI and menus
- Menu toolkit: custom menus, list menus, tabbed menus, anchored controls, viewport grids.
- Player menu views: stats, level, perks, cosmetics, compendium, bank, settings.
- Item browser: search friendly browsing for custom items.

### Stats, combat, and items
- Stat registry: definitions, modifiers, stacking models, condition logic, change events.
- Stat bindings: mirrors key stats to vanilla attributes for visuals.
- Custom damage pipeline: armor curve configuration; bow draw tracking; damage markers.
- Item instances: PDC state for stats, enchants, trims, durability; stable instance ids.
- Ability system: triggers, executors, cooldown keys, lore output.
- Enchants: registry, incompatibility enforcement, curves; versioned item migrations.

### Social and staff operations
- Chat formatting and channels; DMs; staff chat prompts.
- Staff tooling + commands, vanish, shutdown/update workflows, moderation

## Notes and next steps
If I keep extending buh, the next feature implementations are about content: creative usage of the API, new content, retensive (is this a word) content, and additional optimizations.


## Full implementation surface area:

  This is the complete checklist of shipped systems in the core.

  ### Backend
  - Module loader with dependency graph, descriptors, categories, and activation flow
  - Module config service (single source of truth for module toggles)
  - Feature config service with per-feature YAML defaults and typed options
  - Data API with document collections, dot-path reads, patch updates, snapshots, async stages
  - Stores: JSON, Nitrite, MySQL; virtual threads for I/O
  - Ledgers: audit trails and item instance tracking; SQLite or MySQL backends
  - Data migration suite for legacy JSON and store migrations, plus admin commands
  - Cooldown registry with linkable keys, ticket expiry, background reaper
  - Message facade with structured success, info, debug, error output

  ### UI and menus
  - Menu toolkit; registry; rich components; viewport grids
  - Player menu views: stats, level, perks, cosmetics, compendium, bank, settings
  - Item browser;
  - Scoreboard API with modules and per-player state tracking
  - Tab header/footer with TPS and server name

  ### Player systems
  - Player core document: meta, stats, inventory, staff flags
  - Leveling curve; prestige; progress summaries
  - Biome discovery tracker with first-visit timestamps
  - Player settings service; directory service; session hooks
  - LuckPerms meta formatting; offline cached support
  - Per-viewer name rendering via PacketEvents
  - Linked account resolution for osu and Discord aliases

  ### Stats and combat
  - Stat registry; modifiers; stacking models; condition logic
  - Stat service with containers, change events, source context tracking
  - Stat binding manager; custom damage pipeline; bow tracking; damage markers

  ### Items and equipment
  - Item model with modular components, traits, categories
  - YAML item definitions; runtime resolution; vanilla wrapping
  - PDC instance state: ids, stats, enchants, trims, durability
  - Abilities with triggers/executors/cooldowns; lore output
  - Enchants with curves and incompatibilities; item migrations
  - Packet-based lore renderer; durability service; craft provenance logging
  - Inventory safety: creative sanitizer; blocked item masking
  - Anvil/grindstone/smithing/lectern handling; trim recipe blocking; item debug commands

  ### Gameplay systems
  - Economy; mobs with tiers and nameplates; unlockables; cosmetics
  - Crawl manager; stash service; feature vote system
  - Jukebox metadata + PCM streaming; fun module; head drops; perk command

  ### Social and staff
  - Chat formatting; channels; DMs; staff chat prompts; unsigned chat fallbacks
  - Staff service and guard; staff commands; vanish; shutdown module; diagnostics
