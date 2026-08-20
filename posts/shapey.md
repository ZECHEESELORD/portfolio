---
title: Shapey
image: /assets/shapey/hero.gif
published: 2025-06-24
github: https://github.com/ZECHEESELORD/shapey
kind: experiment
tags: Paper, Game Design, Performance
role: Solo proof of concept.
stack: Java, Paper, Particles
mono: "#7aa6e0, #4f7fc4"
initials: SH
---

Shapey began at an hour where sleeping would have been smarter. I wanted to draw a rotating 3D shape in Minecraft with ordinary particles, so I made a cube. Then a sphere. Then a torus. By that point it had become a small geometry playground.

The current plugin keeps particle objects alive in the world, applies transforms every tick, and can morph one point cloud into another. The eventual stupid idea is loading simple `.obj` models ingame.

## Demo

<video controls playsinline preload="metadata" style="max-width: 100%; border-radius: 12px;">
  <source src="https://github.com/user-attachments/assets/d44a8e96-3519-4d48-8e28-2eef9f42aedd" type="video/mp4" />
  Your browser does not support the video tag.
  <a href="https://github.com/user-attachments/assets/d44a8e96-3519-4d48-8e28-2eef9f42aedd">Open video</a>.
</video>

## Keeping a shape alive

Each visible object is a `ShapeInstance`. It stores a point cloud, world position, scale, yaw, pitch, roll, particle type, and any active animation. A central `ShapeManager` ticks the instances and emits the transformed points.

`GeometryFactory` creates the primitive point clouds. Cube edges are sampled linearly. Spheres use latitude and longitude rings. The torus uses the usual two-angle parameterization. Point order stays deterministic because morphing pairs points by index; random ordering turns a sphere-to-cube transition into particle soup.

Every point follows the same transform sequence:

1. Scale around the local origin.
2. Apply roll, pitch, and yaw with explicit axis matrices.
3. Translate into world space.

I kept the matrices explicit because rotation bugs are much easier to find when the numbers are sitting in front of you. Quaternions can arrive later, once Euler angles become sufficiently annoying.

## Morphing

Morphing is linear interpolation between two point arrays:

```text
point(t) = start + (end - start) * t
```

The arrays currently need equal lengths and compatible ordering. That constraint made the first version predictable, which mattered more than handling arbitrary topology at three in the morning. A future model importer will need point remapping and decimation anyway.

For now, Shapey turns geometry and transform math into something visible inside a 20 Hz game loop. Also, spinning particle toruses are cool.
