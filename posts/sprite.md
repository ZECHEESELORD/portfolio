---
title: Sprite
image: https://github.com/user-attachments/assets/2115299c-a04f-4fce-bc59-ce15180f1d2e
published: 2025-11-10
github: https://github.com/haroldDOTsh/sprite
---

Sprite is a designer facing tool for exploring Minecraft’s modern ability to render **arbitrary vanilla textures** inside chat components, titles, and other Adventure surfaces. Drop it into a modern Paper server and you get a searchable atlas browser plus a texture preview flow that stays current as Mojang ships new assets; it does this **without resource packs**.

Modrinth: [Sprite](https://modrinth.com/plugin/sprite)

## What it does
- Builds an index of sprite keys by downloading and caching the matching Mojang client jar, extracting `/atlases` JSON, and indexing textures.
- `/sprite` opens a paginated chat UI showing each atlas, its sprite count, and quick navigation into its contents.
- One-click preview: selecting an icon can pop that sprite into your title bar for a configurable duration.
- Shareable output: each row exposes click to copy snippets for MiniMessage tags and the raw JSON component payload (useful for `/tellraw`).
- Safe refreshes: cache rebuilds are async; `/sprite reload` refetches Mojang data without blocking the main thread.

## Why it’s interesting
Sprite is half UX and half “reliable ingestion.” Mojang’s asset CDN doesn’t hand you a neat “here are all valid sprite keys” endpoint; the plugin has to fetch the right artifacts, validate them, produce a stable index, and then present it in a way that’s actually usable for builders and designers.

The result is a tiny asset pipeline that lives inside the server and outputs copy pasteable UI primitives.

## How it works
### Asset population modes
Sprite supports two population strategies via `plugins/sprite/config.yml`:

- `AUTOMATIC`: pulls the matching Mojang client jar, verifies integrity, extracts atlases, and writes a reusable `textures.index`.
- `MANUAL`: skips downloads and expects atlas files under `plugins/sprite/atlas-cache/`.

### Preview UX
The UI is intentionally pragmatic: browse an atlas, pick a sprite, preview it in a title for inspection, and copy either a MiniMessage representation or raw JSON for reuse.

## Screenshots
### Main menu
![Sprite main menu](https://github.com/user-attachments/assets/ed8c0565-4560-4915-8ae8-eceb00b9edd0)

### Example atlas: blocks
![Blocks atlas list](https://github.com/user-attachments/assets/ca0d06f7-0144-4063-8a5b-5bbf169316f1)

### Copy controls
![Copy MiniMessage or JSON payload](https://github.com/user-attachments/assets/ebf890af-4eac-4f0b-a36c-00dc9b9cfa2a)

### Title preview
![Sprite preview in title](https://github.com/user-attachments/assets/2115299c-a04f-4fce-bc59-ce15180f1d2e)

## Notes
- Targets modern Paper + Adventure builds; the feature relies on newer client rendering behavior.
- Some custom clients may render these icons imperfectly.