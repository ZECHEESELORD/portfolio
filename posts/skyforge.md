---
title: Skyforge Render Engine
image: ../assets/skyforge-cover.svg
published: 2024-11-18
---

## Challenge
Build a performant rendering pipeline for a multiplayer Minecraft realm that could replay world events smoothly while capturing cinematic fly-throughs.

## Approach
- Prototyped a chunk-streaming layer that reads region files ahead of the camera path.
- Batched block updates into mesh layers (solid, translucent, emissive) to keep the GPU state predictable.
- Added a lightweight scripting API for camera rails so creators can choreograph shots without touching code.

## Highlights
1. 120+ FPS in crowded hubs with animated armor stands and particle-heavy scenes.
2. Deterministic replays: camera rails and events are serialized so shots remain frame-accurate between edits.
3. Diegetic HUD: block-style lower thirds and timeline overlays that match the Minecraft aesthetic.

## Tech Stack
- Kotlin + Fabric for ingestion hooks
- Rust worker for mesh baking
- GLSL for the custom lighting pass
- Python notebooks for profiling and telemetry reviews

## What I'd Improve Next
Add a real-time GI probe for interiors and ship a web viewer so clients can scrub camera rails in-browser.
