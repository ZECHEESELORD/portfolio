---
title: Chaotic N-Link Pendulums
image: https://github.com/user-attachments/assets/a98025d6-9a80-44f0-99ae-9670e63a9f13
published: 2025-11-18
github: https://github.com/ZECHEESELORD/chaotic
---

Chaotic is a real-time N link pendulum simulation rendered directly inside Minecraft. It’s a chaos demo, not a perfect physics lab: the goal is stable, visually plausible motion at game tick rates, and a clean implementation that’s easy to work with.

**Full writeup:** the GitHub repo includes a detailed explanation of the math and physics (PBD, Verlet integration, constraint solving, stability notes).  
https://github.com/ZECHEESELORD/chaotic

### What I built
- A **Position Based Dynamics (PBD)** solver using **Verlet integration** for stable motion without a heavy matrix solve.
- Rigid rod constraints enforced via **inverse mass weighting**, so anchored/heavier nodes behave naturally.
- **Substepping** to handle Minecraft’s 20 Hz loop: each tick is split into smaller physics steps for stability.
- Simple energy control via **damping** using Verlet’s implicit velocity.
- A clean split between **physics space (double precision)** and **voxel world rendering** via an affine transform.
- A “butterfly effect” style demo: multi start configurations that diverge from tiny initial differences; plus visual modes for nodes and segments.

### Demo videos
<video controls playsinline preload="metadata" style="max-width: 100%; border-radius: 12px;">
  <source src="https://github.com/user-attachments/assets/6e50c054-7222-4bd9-8e5f-f4c1d7918ac5" type="video/mp4" />
  Your browser does not support the video tag. <a href="https://github.com/user-attachments/assets/6e50c054-7222-4bd9-8e5f-f4c1d7918ac5">Open video</a>.
</video>

<video controls playsinline preload="metadata" style="max-width: 100%; border-radius: 12px;">
  <source src="https://github.com/user-attachments/assets/f79059f8-b409-4fa7-b3f5-5c7c69ff0f19" type="video/mp4" />
  Your browser does not support the video tag. <a href="https://github.com/user-attachments/assets/f79059f8-b409-4fa7-b3f5-5c7c69ff0f19">Open video</a>.
</video>

<video controls playsinline preload="metadata" style="max-width: 100%; border-radius: 12px;">
  <source src="https://github.com/user-attachments/assets/b92f6ace-cefc-44aa-b5a9-8fa6e6da6198" type="video/mp4" />
  Your browser does not support the video tag. <a href="https://github.com/user-attachments/assets/b92f6ace-cefc-44aa-b5a9-8fa6e6da6198">Open video</a>.
</video>


### Links
- Source: https://github.com/ZECHEESELORD/chaotic

### References
- https://journals.aps.org/prl/abstract/10.1103/PhysRevLett.74.1974
- https://cdann.net/pub/dann14a-n-link-pendulum.pdf
