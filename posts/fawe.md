---
title: FAWE: 1xN Schematics, Biomes, and a Divide-by-Zero
image: /assets/fawe/pr3360.png
published: 2025-10-29
github: https://github.com/IntellectualSites/FastAsyncWorldEdit/pull/3360
kind: oss
tags: Open Source, Performance
role: External contributor.
stack: Java, FastAsyncWorldEdit, WorldEdit
mono: "#d0d5dc, #9da8b8"
---

FAWE crashed while pasting one-block-wide schematics with biome data. The input was specific enough to dodge normal testing: `1 x N` or `N x 1`, plus a biome payload.

PR: [FastAsyncWorldEdit #3360](https://github.com/IntellectualSites/FastAsyncWorldEdit/pull/3360)  
Fixes: [#3359](https://github.com/IntellectualSites/FastAsyncWorldEdit/issues/3359)

## What broke

The schematic reader passed its dimensions vector into the clipboard pipeline. That vector was mutable. A later step changed it in place and zeroed one axis, then the biome indexing code divided by the corrupted dimension.

The mutation happened earlier. By the time biome indexing ran, one dimension had already become zero.

## The fix

The reader now passes an immutable copy into the clipboard factory:

```diff
- clipboard = createOutput.apply(this.dimensions);
+ clipboard = createOutput.apply(this.dimensions.toImmutable());
```

That was the entire patch.
