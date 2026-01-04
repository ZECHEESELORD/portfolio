---
title: Shapey
image: /assets/shapey/hero.gif
published: 2025-06-24
github: https://github.com/ZECHEESELORD/shapey
---

Shapey is a Minecraft plugin that renders **3D shapes as particles** in real time. It started as an “I can’t sleep, let’s build something mathy” proof-of-concept, but it ended up being a clean little sandbox for 3D transforms, animation, and geometry generation inside a game loop.

The long term ambition is obvious: use this as a stepping stone toward **rendering arbitrary `.obj` models** in-game.

## What it does
- Spawns persistent particle “objects” (cube, sphere, torus) with configurable scale, rotation, and resolution.
- Applies a full transformation pipeline per point, per tick: **scale -> rotate (yaw/pitch/roll) -> translate**.
- Supports continuous rotation (spin), recoloring, particle-type switching, and deletion.
- Can morph between shapes by interpolating corresponding geometry points.

## Demo
<video controls playsinline preload="metadata" style="max-width: 100%; border-radius: 12px;">
  <source src="https://github.com/user-attachments/assets/d44a8e96-3519-4d48-8e28-2eef9f42aedd" type="video/mp4" />
  Your browser does not support the video tag.
  <a href="https://github.com/user-attachments/assets/d44a8e96-3519-4d48-8e28-2eef9f42aedd">Open video</a>.
</video>

## How it’s built
### Shape instances as first-class objects
Each rendered object is a `ShapeInstance`: it owns geometry, transformation state, animation parameters, and rendering configuration. Instances are tracked by a central `ShapeManager`, which ticks and re-renders active shapes each server tick.

### Geometry generation
A `GeometryFactory` generates point clouds for primitives (cube, sphere, torus) given:
- scale
- resolution (density)
- base rotation

The design goal is practical: predictable point ordering and stable density controls so animation and morphing don’t become guesswork.

### Transformation pipeline
Every point runs through the same pipeline:

1. **Scaling** relative to the shape origin  
2. **Rotation** using explicit per-axis matrix multiplication (Euler angles)  
3. **Translation** to world position  

Rotation order is applied consistently (roll, pitch, yaw), and the math stays explicit on purpose: easy to reason about, easy to debug.

### Morphing
Morphing is implemented by **linear interpolation** between corresponding points in two point arrays.

Constraint (intentional for the PoC):
- both shapes must have the same number of points and compatible ordering

That limitation is a feature for now: it keeps the core predictable and makes future “real model rendering” work easier to compartmentalize.

## Why this is in my portfolio

This is a small project, but it demonstrates the skills I actually lean on in bigger systems:
- translating math into working code under a real-time loop
- building a minimal but coherent architecture (instances, manager, factory)
- implementing real life math and physics for the best block game experience

## Next steps
If I extend Shapey beyond a proof-of-concept, the roadmap is straightforward:

- Maybe move rendering to packet-based particles (reduce server overhead, better control)
- Add import path for simple .obj meshes (with normalization and decimation)
- Potentially improve morphing by remapping points between different topologies
- Definitely introduce quaternion rotation to avoid Euler edge cases