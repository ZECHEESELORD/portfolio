---
title: Survival building without WorldEdit
published: 2026-06-12
kind: case
tags: Paper, Game Design, Display Entities, UI / UX
role: Solo design and implementation.
stack: Java 25, Paper 26.1.2, Display Entities, Creative Library v6, JUnit
image: ../assets/builderwand/cover.jpg
mono: "#9ad7b0, #d9826b"
initials: SB
summary: A survival building tool that stores the job on the item, previews the exact edit in-world, and spends real blocks when it runs.
---

WorldEdit sucks for survival. It hides selection points, lives in commands, and executes instantly. Those choices remove the cost and anticipation from building. For that moment, the player stops *playing*. In my opinion, not great SMP design.

I wanted region editing to behave like a piece of gear: hold the item, point at the build, adjust it in place, and pay for the blocks.

The original idea was inspired by Minikloon's creative server project.

<div class="gallery gallery--captioned gallery--single">
<figure>
<img src="assets/builderwand/builderwand_demo.gif" alt="Corner edits update a persistent world-space outline, so the selection is readable where the build will happen." loading="lazy">
</figure>
</div>

## Put the state on the wand

A versioned `WandState` stores both corners, the attachment loadout, block storage, and preview settings inside the item's `PersistentDataContainer`. Each wand also carries a UUID. The state follows the item through trades and restarts, so two wands can hold different jobs without maintaining a second player-scoped copy.

<div class="gallery gallery--captioned gallery--ui">
<figure>
<img src="assets/builderwand/main_menu.png" alt="The setup menu holds persistent configuration, separate from the in-world control loop." loading="lazy">
</figure>
<figure>
<img src="assets/builderwand/block_storage.png" alt="Block storage and cut mode feed the same cast path with different sources." loading="lazy">
</figure>
</div>

The frequent controls stay in the world. Left click sets or reopens a corner, shift-scroll adjusts it, and shift-click casts. The inventory menu handles configuration. I did not want building to become a sequence of menu opens.

<div class="gallery gallery--captioned">
<figure>
<img src="assets/builderwand/block_load.gif" alt="Loading planks into item-owned storage defines the material budget before a cast." loading="lazy">
</figure>
<figure>
<img src="assets/builderwand/builderwand_block_attachment.gif" alt="Installing an attachment changes the geometry evaluator without changing point selection." loading="lazy">
</figure>
</div>

## Previewing the exact cast

The preview and the cast run through the same `evaluate` path. Every tick resolves the geometry, material cost, world boundary, and block changes that a real cast would use.

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

The tick loop renders its `PreviewFrame`. A cast evaluates again and builds an immutable `CastSnapshot` from the resulting `EffectiveChanges`. Positions already containing the target material are removed before pricing, along with container blocks. The snapshot records the expected material at every remaining position, and the queue checks those values again before starting. A delayed cast cannot overwrite a block that changed while it waited.

Materials are reserved when the job enters the queue and refunded when preflight fails. Active positions are locked against normal placement and breaking until their batch runs. The reservation and position locks prevent free blocks, double spending, and edits racing with players halfway through the animation.

Builds run upward from Point A. Cuts run downward. The current profile writes one block every two ticks and raises the placement pitch through the job. Finishing instantly would be faster. Watching the structure climb out of the ground feels better.

<div class="gallery gallery--captioned gallery--single">
<figure>
<video controls preload="none" playsinline poster="assets/builderwand/block_load_and_cuboid-poster.jpg" aria-label="Material loading, cuboid selection, and queued placement demo">
<source src="assets/builderwand/block_load_and_cuboid.mp4" type="video/mp4">
</video>
<figcaption>The full cuboid path: load material, edit the selection, price the effective blocks, then enqueue that same set.</figcaption>
</figure>
</div>

## Rendering the selection as a HUD

Particles need constant resending and tend to wobble as geometry. A text label such as `12 x 6 x 8` is precise, though the player still has to imagine where that box sits.

`PreviewService` uses `BlockDisplay` entities as a private spatial HUD. A cuboid outline needs twelve displays, one for each edge. Each display is a 1/16th block strip stretched along its axis:

```java
case X -> new Transformation(
        new Vector3f(0.0F, -EDGE_THICKNESS / 2.0F, -EDGE_THICKNESS / 2.0F),
        ZERO_ROTATION,
        new Vector3f(segment.length(), EDGE_THICKNESS, EDGE_THICKNESS),
        ZERO_ROTATION
);
```

Within the 24-block axis cap, the outline remains twelve entities as the box grows. One tick of interpolation smooths corner adjustments. Full brightness keeps the validity colors readable in caves and direct sunlight.

Non-cuboid tools use at most 160 sampled surface points. The sampler keeps extrema first, fills spatial buckets, then uses a stride fallback. A sphere still reads as a sphere without spawning one display per affected block.

<div class="gallery gallery--captioned gallery--single">
<figure>
<video controls preload="none" playsinline poster="assets/builderwand/cylinder-poster.jpg" aria-label="Cylinder selection and queued placement demo">
<source src="assets/builderwand/cylinder.mp4" type="video/mp4">
</video>
<figcaption>The cylinder preview samples its surface, while pricing and execution still use the complete effective block set.</figcaption>
</figure>
</div>

Displays begin invisible and are shown only to the owner or a debug viewer. Sessions reuse entities across frames and remove them when the wand is put away, the player changes worlds, or the preview idles out.

Selection, preview, price, and execution all describe the same edit. The wand therefore behaves as something a lot more intentionally designed.
