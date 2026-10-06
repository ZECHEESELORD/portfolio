---
title: ShaderLab: photographs that refuse to stay flat
image: /assets/shaderlab/title.jpg
published: 2026-09-11
featured: 1
kind: experiment
tags: Paper, Rendering, Shaders, Resource Packs, Packets
role: Solo plugin and resource-pack implementation.
stack: Java, Paper, Minecraft 26.2, GLSL, Resource Packs
mono: "#88a9ee, #ba6267"
initials: SL
summary: A viewfinder, a photograph, and a shader convincing an unmodded Minecraft client that there is a room where there isn't one.
---

I wanted to take a photograph of a Minecraft build, put it somewhere else, and walk around it as though the room in the photograph were actually there. A flat image would look convincing from exactly one angle, which seemed like a fairly disappointing place to stop.

The Viewfinder experiment in ShaderLab lets me capture that room, rotate and scale the photograph, then stamp it into another build. All of this runs through a Paper plugin and a Minecraft 26.2 resource pack, so I have to get the scene into an unmodded client using information Minecraft already knows how to send.

<div class="gallery gallery--captioned gallery--single">
<figure>
<video controls preload="none" playsinline poster="assets/shaderlab/title.jpg" aria-label="ShaderLab viewfinder capture, rotation, placement, and parallax demo">
<source src="assets/shaderlab/viewfinder-demo.mp4" type="video/mp4">
</video>
<figcaption>The viewfinder demo: capture the room, adjust the photograph, stamp it, then move around the result.</figcaption>
</figure>
</div>

## Getting data into a client I can't modify

The server knows which blocks belong to the scene, but that is not particularly useful to a shader until I can get the block data onto the GPU. Alongside the scene, the pack needs to know when the shutter closes and where the photograph is being placed; unfortunately, Minecraft does not have a convenient "please upload my voxel buffer" packet.

I pack the scene and control data into item-model tint colors, then use a custom item vertex shader to recognize the carrier sprites and move their vertices into a small pixel grid. Later passes can read that grid as data, while the same vertex shader supplies the camera and projection matrices and the client's lightmap. It is an odd use for an item tint, but it gives the resource pack inputs that I would otherwise need a client mod to provide directly.

Both the source and destination scenes fit inside `16 x 16 x 16` blocks, which keeps the amount of transported data and traced geometry bounded. The camera works with those controlled snapshots rather than arbitrary builds across the server.

## Keeping the photograph after the shutter closes

While the viewfinder is open, I can choose the shot without changing the stored photograph. Closing the shutter assigns a new capture ID, which tells the GPU passes to latch the color, depth, and capture data into fixed `1024 x 1024` targets rather than keep updating them with every frame.

![The viewfinder framing the source room before capture.](/assets/shaderlab/viewfinder.jpg)

Those targets have to survive after I walk away from the source, otherwise the photograph would gradually replace itself with whatever I happened to be looking at. Keeping the captured depth alongside the color also gives the reconstruction something to compare against when the viewing angle changes.

Before placing it, I can scroll to change the photograph's roll or sneak and scroll to change its scale. Stamping records that pose under a separate placement ID, so moving the camera afterward does not drag the placed photograph around with it, and a new capture preview cannot quietly overwrite the previous placement.

## The photograph is missing most of the room

A photograph of a pillar contains the side facing the camera, but as soon as I walk around the placed image, I need surfaces that were never visible in the original shot. Stretching the photographed pixels around the corner would make it very obvious that I had brought a picture of a room rather than anything resembling a room.

I keep a voxel snapshot alongside the captured color and depth, allowing the shader to traverse the volume and find the surface that each current camera ray should hit. If that surface agrees with the captured depth, the shader can reuse the photographed color; where the new angle reveals something the photograph never saw, it falls back to block textures shaded with the transported lighting and voxel ambient occlusion. The snapshot supplies the missing geometry, so the scene can have parallax without pretending the original image contains every possible view.

## Putting a doorway through the wall

Putting the photograph against a wall adds another problem: the destination wall would normally hide the room I am trying to show through it. The shader traces both snapshots and compares their surfaces with Minecraft's native depth, using the placement volume to decide where the photographed scene replaces the destination. That lets the stamp cut an opening through the wall rather than simply draw another rectangle in front of it.

<div class="gallery gallery--captioned gallery--single">
<figure>
<img src="assets/shaderlab/doorway.gif" alt="Stamping the captured room into the destination wall, then moving toward the resulting opening." loading="lazy">
</figure>
</div>

Although it looks like a block edit, the plugin has cleared the destination test area to air and the shader supplies the visible geometry. That distinction becomes quite obvious if I try to walk into one of its walls, because drawing a convincing block does not give the server anything to collide with.

## Improved Transparency, doing unrelated work

Minecraft's old Improved Transparency post chain gives the pack somewhere to run the reconstruction passes and keep the capture targets, which makes the video setting part of the experiment's rendering path. In the second recording, turning it off removes the virtual blocks and exposes the cleared destination; enabling it again brings the room back without placing any real blocks there.

<div class="gallery gallery--captioned gallery--single">
<figure>
<video controls preload="none" playsinline poster="assets/shaderlab/oit-on.jpg" aria-label="Toggling Improved Transparency to reveal shader-only blocks">
<source src="assets/shaderlab/improved-transparency.mp4" type="video/mp4">
</video>
<figcaption>The same test area with Improved Transparency disabled, then enabled. The room is drawn by the pack, not placed as real blocks.</figcaption>
</figure>
</div>

<div class="gallery gallery--captioned">
<figure>
<img src="assets/shaderlab/oit-off.jpg" alt="Improved Transparency off: the cleared destination does not contain the virtual room." loading="lazy">
</figure>
<figure>
<img src="assets/shaderlab/oit-on.jpg" alt="Improved Transparency on: the shader supplies the walls and floor." loading="lazy">
</figure>
</div>

This dependency also ties the implementation to 26.2, since Minecraft 26.3 replaced the old path with order-independent transparency (OIT) and removed `post_effect/transparency.json`, as described in [the Snapshot 2 notes](https://www.minecraft.net/en-us/article/minecraft-26-3-snapshot-2). Moving the experiment to that renderer means finding another way to run the passes and retain their targets; changing the version number on the pack would not be enough.

The photograph currently survives ordinary camera movement, but it still lives in GPU targets rather than on disk, so a resource reload, transparency change, or disconnect can lose the capture. Saving and sharing photographs would need another storage path. For this experiment, I kept the scope to capturing the bounded room and placing a reconstruction that I could move around, which is already a somewhat unreasonable amount of work for a Minecraft camera.
