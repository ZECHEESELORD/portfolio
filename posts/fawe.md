---
title: FAWE: 1xN Schematics, Biomes, and a Divide-by-Zero
image: /assets/fawe/pr3360.png
published: 2025-10-29
github: https://github.com/IntellectualSites/FastAsyncWorldEdit/pull/3360
---

This is a small fix in a large codebase: a reviewed and merged FAWE patch that prevented a crash on an oddly specific input: **1 x N (or N x 1) schematics that carry biome data**.

PR: [FastAsyncWorldEdit #3360](https://github.com/IntellectualSites/FastAsyncWorldEdit/pull/3360)  
Fixes: [#3359](https://github.com/IntellectualSites/FastAsyncWorldEdit/issues/3359)

## The bug
Users could trigger an **arithmetic exception (divide by zero)** when pasting schematics that were only one block wide or one block long, but only when the schematic included **biome payloads**. Most schematics never hit this; it hid in plain sight.

## The root cause
The reader constructed a clipboard using a **dimensions vector** that was later treated as mutable by the default pipeline. Under this edge case, that mutation could zero out one axis, which then cascaded into a divide-by-zero when the biome data path computed indices using those dimensions.

In other words: nothing was “wrong” with biome math; the dimensions being fed into it had quietly become invalid.

## The fix
The fix was deliberately boring: pass an **immutable** dimensions vector into the clipboard factory so downstream code cannot mutate the reader’s state.

A single method call; about fourteen characters of meaning:

```diff
- clipboard = createOutput.apply(this.dimensions);
+ clipboard = createOutput.apply(this.dimensions.toImmutable());
```