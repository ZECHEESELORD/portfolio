---
title: Chaotic N-Link Pendulums
image: https://github.com/user-attachments/assets/a98025d6-9a80-44f0-99ae-9670e63a9f13
published: 2025-11-18
github: https://github.com/ZECHEESELORD/chaotic
---

Chaotic is a real-time **N-link pendulum** simulation rendered directly inside Minecraft. It’s designed as a **chaos showcase** rather than a perfect physics lab: the goal was **stable, visually plausible motion at Minecraft tick rates**, with an implementation that stays clean and extensible.

**Scope:** built in a weekend (2 days). The constraint was simple: *no heavyweight solver, and no unreadable math blobs.*

**Full write up (math + physics):** PBD, Verlet integration, constraint solving, stability notes  
[github.com/ZECHEESELORD/chaotic](https://github.com/ZECHEESELORD/chaotic)

## Why this is interesting:
The N-link pendulum is chaotic: tiny perturbations diverge quickly. Doing it **in real time** inside a game loop means you fight two enemies:
- **Numerical stability** (exploding energy, jitter, constraint drift)
- **Fixed-step constraints** (Minecraft’s 20 Hz tick loop)

The project is about picking the right approximations to keep it stable and nice looking under those constraints.

## What I built
- **Fully parameterized arbitrary N-link system:** supports arbitrary link counts and per link **arm length**; per node **mass (kg)** / weight factor that feeds inverse mass constraint projection.
- **Position-Based Dynamics (PBD)** constraint solver using **Verlet integration** (stable without a heavy matrix solve).
- Rigid rod constraints enforced via **inverse-mass weighting** (anchors and heavier nodes behave naturally).
- **Substepping** to make Minecraft’s **20 Hz** tick loop workable: each tick is split into smaller physics steps for stability.
- Simple energy control via **damping** (using Verlet’s implicit velocity).
- Clean separation between **physics space (double precision)** and **voxel world rendering** via an affine transform.

## Demo videos:
<video controls playsinline preload="metadata" style="max-width: 80%; border-radius: 12px;">
  <source src="https://github.com/user-attachments/assets/6e50c054-7222-4bd9-8e5f-f4c1d7918ac5" type="video/mp4" />
  Your browser does not support the video tag.
  <a href="https://github.com/user-attachments/assets/6e50c054-7222-4bd9-8e5f-f4c1d7918ac5">Open video</a>.
</video>

<video controls playsinline preload="metadata" style="max-width: 80%; border-radius: 12px;">
  <source src="https://github.com/user-attachments/assets/f79059f8-b409-4fa7-b3f5-5c7c69ff0f19" type="video/mp4" />
  Your browser does not support the video tag.
  <a href="https://github.com/user-attachments/assets/f79059f8-b409-4fa7-b3f5-5c7c69ff0f19">Open video</a>.
</video>

<video controls playsinline preload="metadata" style="max-width: 80%; border-radius: 12px;">
  <source src="https://github.com/user-attachments/assets/b92f6ace-cefc-44aa-b5a9-8fa6e6da6198" type="video/mp4" />
  Your browser does not support the video tag.
  <a href="https://github.com/user-attachments/assets/b92f6ace-cefc-44aa-b5a9-8fa6e6da6198">Open video</a>.
</video>

## Notes and next steps:
If I extend this beyond a weekend build, the next steps would be:
- Add automated checks for constraint drift and stability under different link counts.
- Package the simulation core as a reusable module for other in-game physics demos.