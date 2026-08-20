---
title: buh, the SMP core I run for my friends
image: /assets/buh/buh.png
published: 2025-11-23
github: https://github.com/ZECHEESELORD/buh
kind: case
tags: Paper, Server Systems, Packets
role: Sole engineer and server operator.
stack: Java, Paper, PacketEvents, Nitrite, MySQL, LuckPerms
mono: "#aec8b8, #6f9d78"
---

`buh` is the SMP core I run for my osu! friends. The name went through an extensive branding process lasting several seconds.

The server started collecting features quickly: levels, custom items, combat stats, menus, cosmetics, staff tools, and assorted jokes that somehow needed persistence. I put them in one plugin so they could share the same data model, UI language, item rules, and lifecycle.

I run it for real players. They lose items, reopen menus during reloads, discover impossible crafting paths, and ask why something broke at 1 a.m. They are an excellent substitute for dignity and a decent substitute for QA.

## What players see

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

Menus use the same navigation and pagination. Items use the same lore renderer and instance state. Stats feed combat and appear in profiles, tab, and scoreboards. Packet-side rendering handles the cases where two viewers should see different names or lore.

## Starting and stopping features

Each feature is a module with an ID, category, dependencies, configuration, and one activation path. Startup resolves the dependency graph before enabling anything. Missing dependencies, cycles, and duplicate IDs stop startup before a half-alive server appears.

Module toggles and feature options are typed. A feature can be disabled, migrated, or replaced while the rest of the core keeps running. This matters on a small live server because most changes are shipped while the same group of people is actively trying to break them.

Messages also pass through one facade for success, information, debug, and error output. It sounds minor. It stops every command from inventing a new dialect of green and red text, which is how civilizations fall.

## One data path

Feature code talks to a document API shared with my other projects. Documents support dot-path reads, patch updates, snapshots, and asynchronous stages. Store implementations exist for JSON, Nitrite, and MySQL, with virtual threads used for blocking I/O where they help.

The original server data did not begin in this shape, so `buh` also has migration tooling for legacy JSON and store-to-store moves. Admin commands report progress and failures. Snapshot updates keep feature code from retaining live mutable records across asynchronous work.

Ledgers record staff actions, economy changes, and custom item instances. Every item carries a stable instance ID in its PDC state, which makes duplication bugs and mysterious inventory history much easier to investigate. "Where did this sword come from?" should have a better answer than vibes.

## Items, stats, and combat

The item engine stores component state in PDC: instance ID, stats, enchants, trims, durability, abilities, and migration version. YAML definitions resolve into runtime items, while vanilla stacks can be wrapped by the same model.

Stats are registered definitions with modifiers, stacking rules, conditions, and change events. Selected values bind back onto vanilla attributes for client-side visuals. The custom damage pipeline handles armor curves, bow draw state, hit markers, and source context.

Abilities use named triggers, executors, cooldown keys, and generated lore. Enchantments carry curves and incompatibility rules. Anvil, grindstone, smithing, lectern, crafting, and creative-mode paths all receive explicit handling because custom items become ordinary items very quickly when one inventory screen is forgotten.

## Menus and packet-side UI

The menu toolkit supports ordinary menus, lists, tabs, anchored controls, and viewport grids. Player views cover stats, levels, perks, cosmetics, the compendium, bank, and settings. The item browser adds searchable navigation across custom items.

PacketEvents handles per-viewer name rendering and item lore. That allows staff state, player aliases, and contextual item information to appear for one viewer without mutating the underlying entity or stack for everybody else.

The scoreboard and tab APIs maintain per-player state. A feature publishes values; the renderer handles diffing, formatting, and cleanup.

## Operating the server

Staff tools include vanish, moderation helpers, audit prompts, diagnostics, controlled shutdown, and update workflows. The shutdown module announces the restart, stops new work, saves state, and moves through one owned sequence. It exists because `/stop` is technically an operation plan, just not a very good one.

The same ownership rule applies to modules. Scheduled tasks, menus, packet state, listeners, and caches are registered against the feature that created them. Disabling a module should remove its mess.

The next work is content built on top of this core: more items, mobs, unlocks, and reasons for players to care about the systems already there. The plumbing has had enough attention. It would like to see sunlight.
