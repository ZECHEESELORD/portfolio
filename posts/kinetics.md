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
summary: I put Jolt inside Paper so Minecraft objects could fall, spin, hit live terrain, and leave at speed when somebody brought a sword.
---

I wanted to hit a slime ball with a sword and watch it leave at speed.

Minecraft's display entities are extremely good at the "display" part. Falling, bouncing, and rotating after an off centre hit are apparently "do it yourself" features.

This is how [Jolt Physics](https://github.com/jrouwe/JoltPhysics) ended up inside a Paper plugin.

![A sword strike launches several Minecraft item displays with rigid body physics.](/assets/kinetics/impact.gif)

## I had already tried doing physics myself

Before Kinetics, I made [Chaotic](https://github.com/ZECHEESELORD/chaotic), an N link pendulum experiment. That is a chain of weights connected by rods. I wrote its solver myself: gravity moves each weight, the rods pull their ends back to the correct distance, and the process repeats until the chain stops inventing energy it did not earn.

That was fun because a pendulum is one fairly contained problem. Free moving objects immediately wanted proper contact points, friction, spin, fast collision checks, and an answer for when they could go to sleep. Jolt already had those answers. Rebuilding all of it would mostly teach me why Jolt contains that much C++.

I chose personal growth and used Jolt through its Java bridge.

Using Jolt spared me from writing the solver, but it did not connect itself to a Minecraft server. I still had to feed live terrain into a native engine and turn its results into smooth movement inside a 20 tick game loop.

## First, put physics in a box

Simulating the whole world would let chunk loading, terrain capture, and body counts grow without a limit. I give each scene a fixed box instead. Inside it, Kinetics knows how much land it may have to copy and how many objects it is allowed to wake up.

Each plugin owns its scenes and its cleanup. When that plugin disables, Kinetics closes the scene and removes its virtual displays.

A scene can temporarily take over an existing display or mob, so it records enough state to put them back properly. The display keeps its final physical position, while a mob gets its AI, gravity, collision settings, size, and velocity restored. Leaving a few packet entities behind is ugly. Leaving a cow frozen in midair after a reload becomes a conversation with the server owner.

## The main thread has enough going on

Paper world data can only be read safely on the main server thread. The physics work should not happen there because a busy scene would delay everything else on the server.

Every tick, Paper gathers whatever changed and asks one coordinator thread for exactly `1/20` second of physics. The coordinator advances the scenes, reads all their new positions and velocities in batches, then hands a snapshot back to Paper for packets and callbacks.

If the previous physics step is still running, I skip the new request instead of stacking it in a queue. A queue would eventually produce a beautifully accurate simulation of where the world was three seconds ago. The server has enough problems already.

Terrain capture also gets a strict time allowance, `2 ms` per scene by default, and it can stop halfway through a section to continue next tick. Once Paper finishes copying the block data, a worker builds the Jolt shape and the coordinator installs it. Bukkit world data never leaves the thread that owns it.

## Teaching Jolt what dirt is

Jolt cannot ask Paper which block is under a body every time something falls. I capture each scene in `16 x 16 x 16` block sections and turn those blocks into static collision geometry.

Full blocks get merged. A solid section can become one large box instead of 4,096 tiny boxes all describing the same lump of stone. Stairs, fences, open trapdoors, and other odd blocks keep the smaller collision boxes that Paper reports for them.

The capture starts aging as soon as players resume playing Minecraft. Players place blocks, pistons move them, fluids spread, trees grow, and explosions submit very broad feedback. When any of that happens, I mark the affected section and a one block border around it for rebuilding.

Each rebuild carries a revision number, so an older worker cannot finish late and overwrite newer terrain. While the replacement is being prepared, bodies touching that area are paused; once the newest collider is installed, anything that was awake gets woken again. This avoids colliding with a block that has already been removed or dropping through a floor that is temporarily between versions. Both are noticeable when the test object is a three block wide ender pearl.

## A slime ball is regrettably round

Block displays are easy because Minecraft already knows their collision shapes. Items are mostly flat pictures with a little thickness, so giving every one of them a cube collider looks wrong as soon as it rotates.

For the slime ball, ender pearl, and blaze rod demos, I read the opaque pixels from the vanilla item textures. Each horizontal strip of pixels becomes a thin box with the same `1/16` block depth as Minecraft's generated item model. The collider now follows the visible outline instead of balancing on invisible corners.

Weapons and food use small shapes I made by hand, and known shapes report `EXACT`. Unknown items get a conservative thin box and report `ColliderFidelity.APPROXIMATE`. Resource packs can replace an item's model without telling the server, so there is no more precise answer available.

![A slime ball display spins after an off centre strike beside several other physics bodies.](/assets/kinetics/spinning-slimeball.gif)

This is a slightly silly amount of care for a slime ball. It is also immediately obvious when the thing lands on an edge it visibly does not have. I could not leave it like that.

## Unfortunately, air exists

When a body has no custom material values, I infer them from the Minecraft item. Ice gets almost no friction and slime keeps its bounce. Honey loses its motion quickly, because honey.

Air resistance uses the usual drag equation:

$$
F_d = \frac{1}{2}\rho C_d A v^2
$$

In English, air pushes back harder when an object moves faster. The squared speed matters: twice the speed produces four times the drag. The `A` is how much of the object faces the direction of travel.

That area changes while an object spins. A sword moving edge first catches less air than the same sword moving flat side first, so Kinetics calculates the facing area from its current rotation. Boxes and round shapes have direct formulas. For complicated shapes, I sample the outline from 32 directions the first time it is needed and keep the result.

Without that step, the equation would make a sword slow down exactly like a full block. Mathematically valid. Absolutely not.

## The client needs receipts

Jolt can tell me that a body moved, but the Minecraft client still needs something to draw. I send virtual block and item displays through PacketEvents, using network entity IDs that only exist for players who can currently see them. The server does not need to manage every visual body as a full Bukkit entity.

Bodies close to a player receive a new pose every tick. At medium distance that becomes every two ticks, then every four when the body is farther away, because nobody needs twenty packets per second to admire seven pixels of distant slime ball.

There is a small buffer around each distance boundary. An object has to move clearly across the line before its update rate changes, rather than changing its mind every tick while the player stands on the cutoff. The client glides between the snapshots it does receive, and a sleeping body stops resending the same pose altogether.

Virtual displays create one deeply practical issue: Bukkit cannot report a click on an entity that, as far as Bukkit knows, does not exist. I watch the player's use and attack packets, trace a line from their view through nearby physics scenes, and send the closest hit through the normal interaction event. The impulse is applied at the point that was actually struck, so clipping the side of a sword makes it spin instead of shoving it through the centre.

Mobs stay as real entities. While Jolt controls one, I switch off its AI, gravity, and normal collision, then drive it from the physics pose. They currently turn left and right, but do not tip forward or backward. Pitching a zombie onto its face is funny once and awkward every time after that.

Tests can catch stale terrain or a Jolt body that survived cleanup. The final check still requires joining the server with a sword. JUnit can tell me whether the rotation math still adds up; it cannot tell me whether the slime ball was launched with sufficient sauce.

