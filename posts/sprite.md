---
title: Sprite
image: https://github.com/user-attachments/assets/2115299c-a04f-4fce-bc59-ce15180f1d2e
published: 2025-11-10
github: https://github.com/haroldDOTsh/sprite
kind: oss
tags: Paper, Tooling, Open Source
role: Solo open-source project.
stack: Java, Paper, Adventure, MiniMessage, Modrinth
mono: "#a5c8d0, #5d9aa7"
initials: SP
---

Modern Minecraft clients can render vanilla atlas sprites inside chat components and titles. I kept digging through client assets to find the correct key, so I made `/sprite` and stopped doing that by hand.

On startup, the plugin downloads the matching Mojang client jar, extracts the atlas definitions, and builds a local index. The command opens that index in chat, previews a selection in the title bar, and copies either MiniMessage or raw component JSON. It uses vanilla client assets, so no resource pack is required.

Modrinth: [Sprite](https://modrinth.com/plugin/sprite)

## Building the index

Mojang does not publish one convenient list of valid sprite keys. Sprite fetches the version metadata for the running server, downloads the matching client artifact, verifies it, then reads the JSON under `/atlases`.

The generated `textures.index` is cached under the plugin directory. Reloads happen asynchronously, so rebuilding the cache does not stall the Paper thread.

Two population modes are available in `plugins/sprite/config.yml`:

- `AUTOMATIC` downloads and indexes the matching Mojang client jar.
- `MANUAL` reads atlas files supplied under `plugins/sprite/atlas-cache/`.

The manual path is useful for offline servers and weird development setups. There are always weird development setups.

## Using it

`/sprite` opens a paginated atlas list. From there, a designer can browse sprites, preview one at full title size, and copy either a MiniMessage tag or the raw JSON payload for `/tellraw` and similar surfaces.

Lookup was the annoying part. Once the key is visible and copyable, the plugin has done its job.

## Screenshots

### Main menu
![Sprite main menu](https://github.com/user-attachments/assets/ed8c0565-4560-4915-8ae8-eceb00b9edd0)

### Example atlas: blocks
![Blocks atlas list](https://github.com/user-attachments/assets/ca0d06f7-0144-4063-8a5b-5bbf169316f1)

### Copy controls
![Copy MiniMessage or JSON payload](https://github.com/user-attachments/assets/ebf890af-4eac-4f0b-a36c-00dc9b9cfa2a)

### Title preview
![Sprite preview in title](https://github.com/user-attachments/assets/2115299c-a04f-4fce-bc59-ce15180f1d2e)

Sprite targets modern Paper and Adventure builds. Some custom clients render the icons imperfectly because custom clients enjoy making simple claims exciting.
