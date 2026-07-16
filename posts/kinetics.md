---
title: Kinetics: rigid body physics for Paper
image: /assets/kinetics/impact.gif
published: 2026-07-16
github: https://github.com/ZECHEESELORD/kinetics
kind: case
tags: Paper, Physics, Performance, Game Design
role: Sole engineer. API design, Jolt integration, terrain collision, packet rendering, and demos.
stack: Java 21, Paper 1.21.11, Jolt 5.2, PacketEvents 2.13
mono: "#c7cbc8, #a86243"
initials: KI
summary: A reusable rigid body layer for Paper, with bounded Jolt scenes, live Minecraft terrain, and packet-rendered bodies.
---

Kinetics is a rigid body physics layer for Paper, built on Jolt. It gives other plugins a small API for creating bounded scenes, turning displays or mobs into bodies, applying forces, raycasting, and listening for collisions or player interactions. The bodies collide with the Minecraft world and rotate like objects, rather than doing the floaty hover that is considered vanilla physics.

![Kaboom](/assets/kinetics/impact.gif)

## From Chaotic to Kinetics

Kinetics makes more sense beside [**Chaotic**](https://github.com/ZECHEESELORD/chaotic), my earlier N-link pendulum experiment. Chaotic used a hand-written Verlet integrator and Position-Based Dynamics solver. That was the point of the project: take one constrained system, understand the math, and make it stable enough to look convincing at Minecraft's 20 Hz tick rate.

That approach works because Chaotic is narrow. A pendulum needs particles, rods, gravity, and a renderer. Once I wanted free rigid bodies, writing the solver myself stopped being a sensible side quest. Jolt already knows how to handle collision detection, contact manifolds, sleeping, continuous collision, compound shapes, and raycasts. Rebuilding that list would have been a great way to spend months learning why mature physics engines contain so much code.

So Kinetics uses [Jolt Physics](https://github.com/jrouwe/JoltPhysics) through Jolt JNI. The shared problem sits outside the solver. Minecraft still advances at 20 ticks per second, Paper still owns the world on one thread, and the client still needs smooth motion from discrete server snapshots. Chaotic owns one simulation from top to bottom. Kinetics puts a boundary around a mature solver so normal Paper code can use it without inheriting all of Jolt.

## What using it looks like

A consumer asks Kinetics for an scoped-by-owner context, creates a bounded scene, then adds bodies through the API. Roughly:

```java
KineticsContext physics =
    Kinetics.forPlugin(this);

SceneSpec sceneSpec = SceneSpec.of(
    "arena", world, bounds);

BodySpec bodySpec =
    BodySpec.inferred()
        .pose(Pose.at(spawn))
        .interactable(true)
        .build();

physics.createScene(sceneSpec)
    .thenCompose(scene ->
        scene.createItemDisplay(
            slimeBall, bodySpec));
```

The scene boundary is deliberate. Simulating an entire Minecraft world sounds attractive until chunk loading, terrain rebuilds, body limits, and cleanup all become unbounded at once. A `SceneSpec` fixes the world-space bounds, terrain capture budget, and maximum body count up front. Each consuming plugin gets its own `KineticsContext`, and Kinetics closes that context automatically when the owner disables.

That ownership reaches the visible entities too. Kinetics can create displays, adopt existing block or item displays, or attach to a mob. Releasing an adopted display puts it back into the world at its final physical pose. Releasing a mob restores the AI, gravity, collision state, scale, and velocity captured when Kinetics attached. A plugin reload should not leave frozen mobs or packet entities behind.

## Keeping Jolt off the Paper thread

Paper world access belongs on the main thread. A physics step does not. Kinetics keeps the handoff fairly small:

```text
Paper thread
  capture terrain and queue commands
      |
      v
Kinetics thread
  step Jolt scenes and capture states
      |
      v
Paper thread
  publish packets and callbacks
```

Every server tick requests one fixed `1/20` second physics step. A single coordinator thread drains queued commands, advances the scenes, and reads positions and velocities into direct buffers in batches. It hands the body-state snapshots back to the Paper thread for publication. If the previous physics pass is still running, Kinetics records a skipped tick instead of stacking another pass behind it. Under load, the simulation can slow down. It does not build an ever-growing queue and make the server's bad afternoon worse.

Terrain needs a slightly different split because Bukkit block data can only be read safely on the Paper thread. Each scene gets a small capture budget, `2 ms` by default. Capture can pause halfway through a section and continue next tick. Geometry construction happens on a separate worker, and the finished collider is activated through the physics coordinator.

## Turning a block world into collision geometry

Jolt cannot ask Paper about a block every time a body touches the ground. Kinetics snapshots the bounded scene into `16 x 16 x 16` chunk sections and turns Paper's voxel collision shapes into static Jolt compounds.

Full cubes are greedily merged into larger boxes. A stone floor should be one broad collider, not several thousand one-block children. Stairs, fences, open trapdoors, and other irregular blocks keep the smaller boxes reported by Paper's `VoxelShape`. The geometry stays detailed where Minecraft is detailed and gets cheaper where the world is flat.

Terrain also changes. Players place and break blocks, pistons move them, doors open, fluids flow, trees grow, and explosions are rarely polite enough to happen one block at a time. The Paper event bridge invalidates every affected section plus a one-block neighbour halo. Each rebuild carries a revision, so a slow older build cannot overwrite a newer change.

There is an awkward gap between "the world changed" and "the replacement Jolt shape is active." Kinetics temporarily deactivates bodies that overlap the dirty region. It remembers which ones were awake, installs the newest collider, then wakes those bodies again. Otherwise a body can collide with a block that no longer exists or fall through a floor while its replacement is being built. Neither failure is subtle when the body is a three-block-wide ender pearl.

## Making the collider look like the item

Block displays are the easy case because Paper already exposes their collision shape. Items are mostly flat generated models, and a generic cube collider looks wrong as soon as one starts spinning.

For the slime ball, ender pearl, and blaze rod used in the demos, I took the opaque pixels from Minecraft `1.21.11`'s item textures and extruded each horizontal run to the same `1/16` block depth as the vanilla `item/generated` model. The compound collider follows the visible silhouette. Swords, axes, food, the trident, and the mace use smaller hand-authored compound shapes. Unknown items and custom-model items fall back to a conservative thin box.

The API reports that difference as `ColliderFidelity.EXACT` or `APPROXIMATE`. A caller can decide whether the fallback is acceptable instead of Kinetics quietly pretending it knows the geometry of a resource pack it has never seen.

![A physics-driven slime ball display spinning after a player strikes it beside other demo bodies](/assets/kinetics/spinning-slimeball.gif)

This is a slightly silly amount of care for a slime ball. It is also immediately visible when the thing spins around an edge instead of an imaginary cube.

## Material, mass, and air

If the caller does not provide physical properties, Kinetics infers a broad material profile from the Minecraft material. Ice has very little friction. Slime has high restitution. Honey has none and adds much more damping. Wood, stone, metal, gold, glass, wool, soil, and organic items each get different density and surface behaviour. Every value can still be overridden per body.

Air resistance uses the usual drag equation:

$$
F_d = \frac{1}{2}\rho C_d A v^2
$$

The symbols are less dramatic than they look: air density, a drag coefficient, the area facing the motion, and speed. The useful part is `A`. Kinetics calculates projected area from the body's current rotation, so a thin item moving edge-first catches less air than the same item moving broadside. Boxes, spheres, capsules, and cylinders have direct formulas. Convex hulls and compound shapes sample their silhouette from 32 directions the first time they need it, then keep the result.

It avoids the stranger result where a sword and a full block lose speed in exactly the same way because both received one generic damping constant.

## Rendering bodies without spawning hundreds of entities

A Kinetics body does not need to be a live Bukkit display entity. Block and item displays are rendered with virtual entity IDs through PacketEvents. Kinetics sends spawn, metadata, teleport, and destroy packets only to players who should currently see each body.

Publication rate depends on distance. Nearby bodies update every tick, mid-range bodies every two ticks, and far bodies every four. A small hysteresis band keeps objects near a boundary from switching rates back and forth. Display interpolation fills the visual gap on the client. Sleeping bodies reuse the same snapshot and stop sending redundant pose packets.

Virtual entities introduce another problem: Bukkit cannot route a click to an entity it does not know exists. The event bridge watches the relevant use and attack packets, raycasts through every candidate scene, and dispatches the closest hit as a normal Kinetics interaction event. The demo applies an impulse at the actual hit point, so an off center sword swing produces rotation instead of a generic shove through the center.

Mobs take the other path. While attached, their AI, gravity, and Bukkit collision are disabled, and the latest Jolt pose drives the real entity. Mob rotation is currently yaw-only because pitching a zombie onto its face is funny once and awkward forever.

## Tests

The tests sit around stuff like: quaternion normalization, generated item masks, shape scaling and cache lifetime, terrain revision races, display distance bands, native cleanup, etc. The packet animation and the actual feel of an impact still need an ingame test. JUnit cannot tell me whether a spinning slime ball looks right, unfortunately.
