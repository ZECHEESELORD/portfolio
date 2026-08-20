---
title: Impact Frames
image: /assets/impact/impact.gif
published: 2026-07-17
kind: experiment
tags: Fabric, Rendering, Shaders, Game Design
role: Solo rendering experiment.
stack: Java 25, Minecraft 26.3, Fabric, Mixin, GLSL
mono: "#f4f1e8, #a01824"
initials: IF
summary: A normal sword hit briefly cuts Minecraft into ink, paper, and one very unfortunate target.
---

Impact Frames started with me reading the new Minecraft 26.3 rendering API and immediately deciding that I was sufficiently bored enough to dedicate a weekend to learning graphics programming. I really wanted to see how if I could somehow implement a stylistic impact frame in Minecraft.

The first version proved the pipeline and looked like a full screen filter. For the sword version, I split the shot into a target mask, a camera sequence, and a slash shader.

![A sword hit triggering the current Impact Frames sequence](/assets/impact/impact.gif)

## The first pass

The original version triggered on spear lunges. Its post effect worked, though the target dissolved into the background treatment and the whole image read as one filter. Not very good looking.

![The earlier Impact Frames treatment](/assets/impact/impact_old.gif)

The struck entity now gets its own mask. A short camera sequence places it on screen, then the shader builds the ink cut around the matching contact point.

## What changed in 26.3

Minecraft 26.3 added a request/apply path for post effects in `GameRenderer`. A mod can request a namespaced effect for the current frame; Minecraft resolves its JSON chain and records whether it ran.

```java
if (ImpactClient.isActive()) {
    ((GameRenderer) (Object) this)
        .getRequestedPostEffects()
        .add(ImpactClient.requestedPostEffect());
}
```

Impact Frames uses that path for the effect lifecycle. The mixins choose the inputs and provide one extra render target. Minecraft schedules the chain through its own frame graph.

## Hooking the hit

The player mixin wraps vanilla's `hurtOrSimulate` call. Vanilla resolves the damage first. Once a sword hit against a living target is accepted, the mod records the entity ID.

```java
boolean accepted = original.call(target, source, amount);
if (accepted
        && target instanceof LivingEntity
        && (Object) this instanceof ServerPlayer player
        && player.getWeaponItem().is(ItemTags.SWORDS)) {
    impact$acceptedSwordTarget = target.getId();
}
```

The sequence starts when `Player.attack` returns, after vanilla has finished updating combat state.

## Keeping the target separate

I reused Minecraft's entity-outline target as a silhouette mask. During the sequence, only the struck entity renders into it, using sentinel magenta. The vanilla outline composite is skipped and the buffer is imported beside the main scene.

```json
"inputs": [
  {
    "sampler_name": "Scene",
    "target": "minecraft:main"
  },
  {
    "sampler_name": "TargetMask",
    "target": "minecraft:entity_outline"
  },
  {
    "sampler_name": "Brush",
    "location": "impact:dry_brush"
  }
]
```

The shader receives the scene, the target silhouette, and a dry-brush texture. That is enough to preserve the target while the rest of the frame gets bullied.

## Building the shader

The target mask controls where the original scene is sampled back into the frame. `displacedTargetUv` shifts each fragment, while `targetSliceGap` removes the cut from the silhouette.

```glsl
float targetGap = targetSliceGap(
    slashPoint, screenCenter, halfExtents, timeMs, slashPreset
);
float target = targetAt(displacedUv);
float targetAlpha = target * (1.0 - targetGap) * fragmentVisibility;
color = mix(color, texture(SceneSampler, displacedUv).rgb, targetAlpha);
```

Two small dilations around that mask produce the paper outer rim and ink inner rim. The cut itself is a signed line field. I quantize its distance to pixel-sized steps, disturb the centerline with seeded coarse and fine noise, then erode it with brush luminance.

```glsl
float pixel = 1.0 / max(OutSize.y, 1.0);
float jaggedAcross = floor(
    (across - centerOffset) / pixel + 0.5
) * pixel;
float survival = growth
    * step(erosion * 1.05, fibers)
    * (1.0 - smoothstep(0.88, 1.0, erosion));
```

One payload seed controls slash geometry and splatter placement. Elapsed milliseconds, mirror state, and slash preset share the existing `GameTime` uniform.

## Authoring the composition

The camera sequence uses paired fields of view, rolls, and screen anchors.

```java
private static final float[] SHOT_FOV = {
    44.0F, 25.0F, 66.0F, 32.0F, 76.0F, 21.0F, 54.0F, 28.0F, 18.0F
};

private static final ScreenAnchor[] SCREEN_ANCHORS = {
    new ScreenAnchor(0.74, 0.65),
    new ScreenAnchor(0.25, 0.62),
    new ScreenAnchor(0.72, 0.26)
    // ...
};
```

`aimAtAnchor` converts each screen anchor into yaw and pitch after applying field of view, roll, and aspect ratio. The matching GLSL contact anchor puts the slash through the same point on screen. The target stays readable, the cut lands where the camera expects it, and a normal sword hit gets to be absurd for a moment.
