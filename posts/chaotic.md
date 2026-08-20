---
title: Chaotic N-Link Pendulums
image: https://github.com/user-attachments/assets/a98025d6-9a80-44f0-99ae-9670e63a9f13
published: 2025-11-18
github: https://github.com/ZECHEESELORD/chaotic
kind: experiment
tags: Paper, Game Design, Performance
role: Solo weekend build.
stack: Java, Paper, PBD, Verlet integration
mono: "#d5b891, #a97947"
---

A two-link pendulum was insufficiently stupid, so I made the link count configurable and rendered the result inside Minecraft.

Chaotic is a realtime N-link pendulum simulation built over one weekend. I wanted stable, convincing motion at 20 ticks per second, readable math, and a solver small enough that I could understand every bad decision it made.

Full writeup and source: [github.com/ZECHEESELORD/chaotic](https://github.com/ZECHEESELORD/chaotic)

## Making it survive 20 Hz

A chaotic pendulum amplifies tiny numerical errors very quickly. Minecraft gives the simulation one coarse `50 ms` tick, which is plenty of time for rods to stretch, energy to appear from nowhere, and the whole thing to leave the mortal plane.

I used Verlet integration with Position-Based Dynamics constraints. Positions advance under gravity, then the solver repeatedly projects each rod back to its target length. Inverse-mass weighting decides how much each endpoint moves; anchors stay fixed and heavier nodes yield less.

Each server tick is split into smaller physics steps. That costs more CPU, though it gives the constraint solver a much easier problem and keeps long chains from shaking themselves apart. A small damping term removes the energy introduced by approximation and voxel-scale rendering.

The system supports arbitrary link counts, per-link lengths, and per-node mass. Physics runs in double precision. A separate affine transform maps the result into Minecraft blocks and particles, so the solver never needs to know that its pendulum is being displayed in the best block game.

## Demo videos

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

The next useful work would be automated drift tests across link counts and substep settings. The current version was judged by the rigorous scientific standard of "does this look sick and remain on screen?"
