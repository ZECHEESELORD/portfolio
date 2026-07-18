---
title: Survival building without WorldEdit
published: 2026-06-12
kind: case
tags: Paper, Game Design, Display Entities, UI / UX
role: Game design and engineering: selection model, spatial HUD, shape tools, survival economy, and edit lifecycle.
stack: Java 25, Paper 26.1.2, Display Entities, Creative Library v6, JUnit
image: ../assets/builderwand/cover.jpg
mono: "#9ad7b0, #d9826b"
initials: SB
summary: A survival region editor built around item-owned state, one preview and execution path, and a private display entity HUD.
---

WorldEdit sucks for survival. Its invisible points, commands, and instant edits make sense for an admin tool. In survival they remove the cost and anticipation from building; for a moment, the player stops playing and operates the map.

This project started with a narrower question: could region editing behave like a piece of gear?

The original idea was inspired by Minikloon's creative server project.

<div class="gallery gallery--captioned gallery--single">
<figure>
<img src="assets/builderwand/builderwand_demo.gif" alt="Corner edits update a persistent world-space outline, so the selection is readable where the build will happen." loading="lazy">
</figure>
</div>

## Put the state on the wand

A versioned `WandState` stores both corners, the attachment loadout, block storage, and preview settings inside the item's `PersistentDataContainer`. Each wand also carries a UUID. The state travels with the item through trades and restarts, so two wands can hold different jobs without a player-scoped copy to reconcile.

<div class="gallery gallery--captioned gallery--ui">
<figure>
<img src="assets/builderwand/main_menu.png" alt="The setup menu holds persistent configuration, separate from the in-world control loop." loading="lazy">
</figure>
<figure>
<img src="assets/builderwand/block_storage.png" alt="Block storage and cut mode feed the same cast path with different sources." loading="lazy">
</figure>
</div>

I kept the frequent controls in the world: left click sets or reopens a corner, shift-scroll adjusts it, and shift-click casts. The inventory menu is only for configuration. I did not want building to become a sequence of menu opens.

<div class="gallery gallery--captioned">
<figure>
<img src="assets/builderwand/block_load.gif" alt="Loading planks into item-owned storage defines the material budget before a cast." loading="lazy">
</figure>
<figure>
<img src="assets/builderwand/builderwand_block_attachment.gif" alt="Installing an attachment changes the geometry evaluator without changing point selection." loading="lazy">
</figure>
</div>

## One evaluation, used twice

A spatial preview becomes harmful if the real cast disagrees with it, so both run through the same `evaluate` path. Every tick it resolves geometry and runs the same cost, boundary, and block-change checks used for casting.

Evaluation returns one record:

```java
private record LiveEvaluation(
        PreviewService.PreviewFrame frame,
        Component hud,
        Component subtitle,
        SelectionBox box,
        AxisChoice axisChoice,
        CastPlanning.EffectiveChanges changes,
        SourceStatus sourceStatus,
        boolean dimensionsValid,
        boolean blockLimitValid
) {}
```

The tick loop renders its `PreviewFrame`. A cast runs `evaluate` again and builds an immutable `CastSnapshot` from the same `EffectiveChanges`. Positions that already contain the target material are removed before pricing, as are container blocks. The snapshot records the expected material at every remaining position; the queue checks those values again before it starts. A delayed cast cannot overwrite a block that changed while it was waiting.

Materials are reserved on enqueue and refunded if that preflight fails. Active positions are locked against normal placement and breaking until their batch runs. These checks prevent free blocks, double spending, and mid-animation races without splitting preview and execution into separate rule sets.

Builds run bottom-up from Point A; cuts run top-down. The current profile writes one block every two ticks and raises the placement pitch through the job. WorldEdit optimizes for finishing an edit. This queue gives the edit enough time to read as an action inside the game.

<div class="gallery gallery--captioned gallery--single">
<figure>
<video controls preload="none" playsinline poster="assets/builderwand/block_load_and_cuboid-poster.jpg" aria-label="Material loading, cuboid selection, and queued placement demo">
<source src="assets/builderwand/block_load_and_cuboid.mp4" type="video/mp4">
</video>
<figcaption>The full cuboid path: load material, edit the selection, price the effective blocks, then enqueue that same set.</figcaption>
</figure>
</div>

## Rendering the selection as a HUD

Particles must be resent and do not hold stable geometry. Text has the opposite problem: `12 x 6 x 8` is precise, but the player still has to project it into the world.

`PreviewService` uses `BlockDisplay` entities as a private spatial HUD. A cuboid outline is twelve displays, one per edge. Each is a one-sixteenth-block strip stretched along its axis:

```java
case X -> new Transformation(
        new Vector3f(0.0F, -EDGE_THICKNESS / 2.0F, -EDGE_THICKNESS / 2.0F),
        ZERO_ROTATION,
        new Vector3f(segment.length(), EDGE_THICKNESS, EDGE_THICKNESS),
        ZERO_ROTATION
);
```

Within the 24-block axis cap, the outline stays at twelve entities as the box grows. One tick of interpolation smooths corner adjustments; full brightness prevents surrounding light from washing out the validity colors.

Non-cuboid tools use at most 160 sampled surface points. The sampler keeps extrema first, fills spatial buckets, then uses a stride fallback. A sphere still reads as a sphere without spawning one display per block.

<div class="gallery gallery--captioned gallery--single">
<figure>
<video controls preload="none" playsinline poster="assets/builderwand/cylinder-poster.jpg" aria-label="Cylinder selection and queued placement demo">
<source src="assets/builderwand/cylinder.mp4" type="video/mp4">
</video>
<figcaption>The cylinder preview samples its surface, while pricing and execution still use the complete effective block set.</figcaption>
</figure>
</div>

Displays default to invisible and are shown only to the owner or a debug viewer. Sessions reuse entities across frames and remove them when the wand is put away, the player changes worlds, or the preview idles out.

The shape list is incidental. Item state, survival cost, preview, and execution share one model. Display entities expose that model in the same coordinate space as the build, which is what makes the wand feel like a tool rather than WorldEdit behind a different input.


