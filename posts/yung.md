---
title: Porting YUNG's Mods to 1.21.11
image: /assets/yung/title.png
published: 2026-06-01
github: https://github.com/ZECHEESELORD/yung-1.21.11-fabric-ports
kind: oss
tags: Fabric, Modding, Open Source
role: Porting engineer.
stack: Java, Fabric API, Fabric Loader, Mixin, Gradle
mono: "#9fb9d8, #7f9cc2"
---

Eternum (Streamer SMP!) uses Better End Island, Better Strongholds, and YUNG's Bridges. All three depend on YUNG API. None had a Fabric `1.21.11` build, so I ported the shared API and then dragged the downstream mods across with it.

The working branch is still named `1.21.4`, which is a decent summary of how the job began.


## Start with YUNG API

Most of the version churn belonged in the shared library. YUNG API contains fifty-three tracked file changes plus two support classes, `PotionAccessor` and `NoiseChunkDimensionsProvider`. It now targets Minecraft `1.21.11`, Fabric API `0.141.3`, and Loader `0.18.6`.

Once that built, the three mods mostly needed their own adapters and worldgen fixes.

| Mod | MC target | YUNG API | Main work |
|---|---|---|---|
| YUNG API | `1.21.11` | `5.10.0-beta0` | registries, entities, mixins, worldgen helpers |
| Better End Island | `1.21.11` | `5.10.0-beta0` | dragon-fight lifecycle and spike placement |
| Better Strongholds | `1.21.11` | `5.10.0-beta0` | safe block placement and entity NBT |
| YUNG's Bridges | `1.21.11` | `5.10.0-beta0` | template processing and biome injection |

Porting YUNG API first removed most of the duplicate work.

## Registry changes

Potion registration became holder-aware. `AutoRegisterPotion` now stores a `Holder<Potion>`, while `PotionModuleFabric` registers through `Registry.registerForHolder`. A small `PotionAccessor` mixin assigns the potion name before registration because the newer lifecycle rejects unnamed instances.

Blocks and items needed their `ResourceKey` set on the properties before constructing derived stairs, slabs, and block items. `BlockModuleFabric` and `ItemModuleFabric` now establish the ID early enough for those constructors.

`AutoRegisterEntityType` was rebuilt around the current `EntityType.Builder` shape. The port carries attachments, eye height, passenger and vehicle offsets, spawn scale, and peaceful-mode handling through the wrapper.

## Mixin surgery

The old code read chunk dimensions through a `NoiseSettings` accessor that vanished. `NoiseChunkMixin` now implements a tiny `NoiseChunkDimensionsProvider` interface:

```text
yungsapi$getHeight
yungsapi$getMinY
```

`EnhancedBeardifierHelper` can read the dimensions it needs without depending on the removed accessor. It also reconstructs Beardifier state from structure pieces, junctions, and affected bounds. Worldgen internals are pleasant in the same way dental work is pleasant.

`FixJukeboxCrashMixin` uses `require = 0` on its injection. If the target shifts again, the compatibility fix will fail softly and leave the rest of the mixin set loadable. It also exits when the jukebox level is null. The ugly compatibility case stays isolated in one file.

Better End Island needed two related lifecycle changes. `EndDragonFightMixin` now uses the radius-aware `addTicketWithRadius` API for dragon chunk tickets. `ServerLevelMixin` detects the End through `Level.END`, which survives the dimension-type changes that broke the older location check.

## Jigsaws and templates

The custom jigsaw classes moved to the current codec and template APIs:

- `YungJigsawStructure`
- `YungJigsawSinglePoolElement`
- `JigsawStructureAssembler`

Template IDs now use `Identifier.CODEC`, and jigsaw entries use `StructureTemplate.JigsawBlockInfo`. The port preserves YUNG's custom selection-priority comparator over `JigsawBlockInfo::selectionPriority`, so generated layouts retain their authored ordering.

Compilation does not catch block-state drift inside generated structures. Missing wall connections or waterlogging can leave a technically valid port looking obviously broken.

In Bridges, `ITemplateFeatureProcessor` carries `NORTH`, `EAST`, `SOUTH`, `WEST`, `UP`, and `WATERLOGGED` across the renamed wall properties. Better End's `BlockReplaceProcessor` performs the same kind of preservation through `BlockStateProperties`.

Better Strongholds routes pillar placement in `LegProcessor` through `setBlockStateSafe`. `ArmorStandProcessor` and `ItemFrameProcessor` read the current entity NBT, inspect `ArmorItems`, and rebuild the tag using the newer representation.

`BetterSpikeFeature` updates its template IDs and places end crystals with `snapTo`, which is considerably better than spawning the boss decoration approximately where it belongs.

## Bridges' Fabric entry point

YUNG's Bridges is implemented as feature-based worldgen. `BridgeFeatureConfig` now serializes template IDs with `Identifier.CODEC`, while `AbstractTemplateFeature` keeps NBT template loading in one reusable path.

The Fabric-specific part lives in `BiomeModificationModuleFabric`. It adds the bridge placed feature at `SURFACE_STRUCTURES` to biomes tagged `has_structure/bridge`.

At that point the whole stack builds together: YUNG API, Better End Island, Better Strongholds, and Bridges, all on `1.21.11`. The remaining work is cleanup, upstream-friendly commit splitting, and discovering which tiny worldgen assumption I offended next.
