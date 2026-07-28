---
title: Rendering a spinning black hole in Minecraft
published: 2026-07-27
kind: experiment
tags: Fabric, Rendering, Shaders, Math
role: Rendering and shader engineering across ray integration, disk shading, temporal sampling, and Minecraft compositing.
stack: Java 25, Minecraft 26.2, Fabric, GLSL
image: ../assets/blackhole/v2_art_directed.png
mono: "#f1e5d5, #806048"
initials: BH
summary: A weekend Fabric experiment that started with Schwarzschild lensing, acquired a spinning Kerr model, and ended with me art directing the laws of physics.
---

The first pass worked.

*"ma, why does my mathematically (sort of) accurate black hole look worse than this art directed shader thing?"*

Unfortunately, this was a compelling argument.

This started as an "oh hey, I saw this black hole on Reddit, let's make it" weekend experiment. It then acquired a Kerr metric, several HDR render targets, and opinions about black body radiation. Normal weekend stuff.

The Schwarzschild render did exactly what I asked. It bent light, swallowed the correct rays, and wrapped the accretion disk around the event horizon. In daylight, it also bent a considerable portion of the nearest forest because the forest was there. At night, the same renderer was easier to read, but not more correct. Both images were behaving.

<div class="gallery gallery--captioned">
<figure>
<img src="assets/blackhole/v1_day.png" alt="The Schwarzschild pass in daylight, with nearby terrain bent heavily through the lens." loading="lazy">
</figure>
<figure>
<img src="assets/blackhole/v1_night.png" alt="The same Schwarzschild pass at night, where the thin disk and symmetric lens are easier to read." loading="lazy">
</figure>
</div>

That answered the original question: does the math make Minecraft bend around the hole? Yep. Then I reopened the art directed reference and got petty. I started separating what came from the spacetime model, what came from the disk, and which values I could adjust until the shot looked intentional.

## Somehow, Schwarzschild

Each rendered pixel begins with a tiny numerical crisis. The shader reconstructs a camera ray from the inverse projection and view matrices, moves it into the black hole's local coordinate system, and normalizes every distance so the event horizon has radius one.

The Schwarzschild pass advances that ray through a sphere sixteen horizon radii wide. Steps get smaller near the hole and larger farther away. At each step, the shader checks whether the ray crossed the horizon or escaped the trace volume. If neither happened, congratulations to that fragment. It gets more math.

The acceleration is compact enough to look fake:

```glsl
vec3 schwarzschildAcceleration(vec3 position, float angularMomentumSquared) {
    float inverseRadius = inversesqrt(max(dot(position, position), 0.0001));
    float inverseRadius5 = inverseRadius * inverseRadius * inverseRadius
        * inverseRadius * inverseRadius;
    return -1.5 * angularMomentumSquared * position * inverseRadius5;
}
```

It is not fake. I integrate it with a velocity Verlet step: apply half the acceleration, move the ray, then apply the other half at the new position. That keeps the path stable around the interesting radii without paying for a fancier solver on every fragment.

Two numbers carry a lot of this operation. The photon sphere sits at `r = 1.5`, where light can orbit the hole. The critical impact parameter is about `2.598`. Rays below that threshold are gone. Rays above it scatter back out with their direction thoroughly revised. The bright ring gathers around that boundary.

<div class="gallery gallery--captioned gallery--single">
<figure>
<img src="assets/blackhole/v1.gif" alt="The Schwarzschild renderer in motion as the camera circles it at night. The forest was not consulted." loading="lazy">
</figure>
</div>

## The disk was flat and I knew it

The lens was behaving. The first disk was a flat intersection, and visually it was not beating the flat allegations. It could draw the right outline, but it had no depth, internal variation, or self occlusion. The current disk is a continuous volume sampled along each curved ray.

Its density has an inner cutoff, a soft outer taper, and a vertical falloff that grows toward the edge. Three scales of value noise rotate around the spin axis at a radius dependent speed. Inner material moves faster, so the pattern shears instead of rotating as one suspiciously tidy plate.

Each ray segment uses Beer-Lambert transmission. Denser material over a longer distance blocks more of the light behind it. The shader adds the current segment's emission, reduces the remaining transmission, and keeps walking until the ray escapes, falls into the horizon, or has almost no light left to contribute. "Make the space circle glow" had become radiative transfer. Great.

Color begins with a black body temperature. Radius lowers it, gravity redshifts it near the hole, and orbital motion applies a Doppler shift. The side rotating toward the camera becomes hotter and brighter. Relativistic beaming pushes that imbalance further. The uneven light is physics. Me interfering with the exposure comes later.

## Then I added spin

The first pass used Schwarzschild spacetime, which describes a nonspinning black hole and produces a symmetric lens. The reference shader was winning the screenshot argument, so I moved to Kerr and made this a real math problem.

I normalize the Kerr mass so the outer horizon stays at radius one for any supported spin. The shader evaluates a Kerr-Schild field, derives a potential from the ray momentum, and estimates its spatial derivative with three small finite differences. That derivative updates the momentum before the next position step.

Numerical drift can quietly turn the ray into something that no longer satisfies the null condition required for light. After each update, the shader solves a quadratic for the momentum magnitude and puts the ray back on that constraint. Floating point integration is perfectly willing to create slightly not light if nobody checks on it.

Spin separates prograde and retrograde paths. Light travelling with the rotation can pass closer than light travelling against it, so the photon ring shifts instead of staying perfectly even. The disk already has a brighter approaching side. Kerr gives the lens itself a preferred direction.

![The Kerr treatment, with an asymmetric disk and less of the surrounding world fighting for attention.](/assets/blackhole/v2_art_directed.png)

The final frame uses art direction where the physics alone does not read clearly. The traced ray supplies the physical bend, then a separate lens strength control can push that deflection without enlarging the event horizon. Disk thickness, density, temperature, and exposure can be adjusted separately. The restrained settings were mathematically polite and visually easy to ignore. I had already done polite.

## When the black hole needs a pixel that is not on screen

Say there is a mountain just outside the left edge of the screen. The black hole bends light from that mountain into the middle of the image. To draw the new pixel, the shader needs the mountain's color. Minecraft never rendered it because the camera could not see it.

Repeating the last visible pixel stretches the edge of the world into a smear. Returning nothing leaves a black gap. The daylight screenshot shows a useful amount of the smear.

The fix is to remember what the camera saw earlier. The renderer keeps a map with six square faces, enough to store colors from every direction. As the player looks around, visible sky and terrain are added to that map. In the code, this is the directional atlas, packed into a `3 x 2` texture.

When a bent ray points outside the current view, the shader checks the atlas. Sky stays stored for longer because it changes slowly. Terrain is discarded sooner because moving the camera quickly makes an old hillside wrong.

The renderer also keeps the previous black hole frame. If the current result is close to it, a small amount is reused. If the image changed too much, the old frame is ignored. This calms the flicker from rendering the effect at a lower resolution without leaving an old ring behind.

Finally, the disk is rendered in HDR so its brightest parts can glow without bleaching the whole Minecraft scene. Only those bright parts are blurred. The depth buffer keeps a tree or hill in front of the black hole when it should be, and the hand and HUD are drawn afterward. The hotbar has done nothing to deserve gravitational lensing.

This started because I saw a black hole on Reddit and thought, yeah, I can put that in Minecraft.
