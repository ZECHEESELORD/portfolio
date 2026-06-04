---
title: Porting YUNG's Mods to 1.21.11
image: /assets/yung/title.png
published: 2026-06-01
github: https://github.com/ZECHEESELORD/yung-1.21.11-fabric-ports
kind: oss
tags: Fabric, Modding, Open Source
role: Porting engineer. Shared library migration and downstream adapters.
stack: Java, Fabric API, Fabric Loader, Mixin, Gradle
mono: "#9fb9d8, #7f9cc2"
---

Eternum leans on YUNG's worldgen mods: Better End Island, Better Strongholds, and YUNG's Bridges, all sitting on top of YUNG API. None of them had a `1.21.11` build yet, so I ported them to Fabric. This is that work, and it's uncommitted: it lives on a working branch (still named `1.21.4`, which tells you where it started) and builds locally against the rest of the stack. "Uncommitted" is the honest label: the code compiles and runs, it just hasn't been cleaned up into something I'd push back to the original repos.

The thing worth saying up front is that porting four mods at once is not four independent jobs.

## YUNG API is the hub

Everything downstream declares one line- `yungsapi_version=5.10.0-beta0`- and inherits the seam work done once in the library. So that's where the bulk of the diff lives: fifty-three tracked file changes in YUNG API, plus a couple of new untracked support classes (`PotionAccessor`, `NoiseChunkDimensionsProvider`). The library now targets `1.21.11` on Fabric API `0.141.3` and Loader `0.18.6`. The three downstream mods mostly just point at the new API and fix their own last-mile adapters.

| Mod | MC target | YUNG API | Port shape |
|---|---|---|---|
| YUNG API | `1.21.11` | `5.10.0-beta0` | the hub: registry + worldgen seams |
| Better End Island | `1.21.11` | `5.10.0-beta0` | bossfight lifecycle surgery |
| Better Strongholds | `1.21.11` | `5.10.0-beta0` | safe placement + NBT resilience |
| YUNG's Bridges | `1.21.11` | `5.10.0-beta0` | feature-based worldgen port |

That's the whole point of starting at the API: porting one library is what lets four mods move together instead of becoming four separate piles of churn.

## The interesting part: adapters at the seams vanilla keeps moving

Modern Minecraft keeps reshaping the same handful of seams: the registry lifecycle, worldgen internals, dimension identity. A port is mostly the work of meeting those seams where they moved without rewriting the mod around them.

Registration tightened, so it became holder aware. `AutoRegisterPotion` is now backed by a `Holder<Potion>` instead of handing downstream code a raw potion object; `PotionModuleFabric` registers through `Registry.registerForHolder`, and a small `PotionAccessor` mixin names the potion instance before it goes in, because an unnamed potion is no longer something the registry will quietly accept. Blocks and items got the same medicine: `BlockModuleFabric` and `ItemModuleFabric` set the `ResourceKey` id on the properties *before* constructing derived stairs, slabs, and block items, which is the lifecycle ordering newer versions increasingly require. `AutoRegisterEntityType` was rebuilt to mirror the current `EntityType.Builder` shape: attachments, eye height, passenger/vehicle offsets, spawn scale, peaceful mode handling.

The mixin work is things get a bit borked. When vanilla removed the `NoiseSettings` accessor the old code leaned on, the fix wasn't to fight it: `NoiseChunkMixin` implements a tiny `NoiseChunkDimensionsProvider` interface (`yungsapi$getHeight`, `yungsapi$getMinY`) so the chunk dimensions are read from a narrow local seam instead of a deleted API. `EnhancedBeardifierHelper` reconstructs Beardifier state from pieces, junctions, and affected bounds- exactly the kind of worldgen internals surgery that is fragile and load bearing at the same time. And `FixJukeboxCrashMixin` is a small lesson in defensive mixin discipline: it injects with `require = 0` so an injection point that shifted between versions can't hard fail the mixin, and it cancels out when the jukebox's level is null. The crash fix stays boxed in one file instead of bleeding into the rest of the API.

Better End Island carries the same posture into the boss fight. `EndDragonFightMixin` moves the dragon's chunk tickets onto the radius-aware `addTicketWithRadius`, and `ServerLevelMixin` switches End detection to `Level.END` rather than guessing from an older dimension-type location.

## Worldgen that survives the API churn

The cleanest class level story is the jigsaw rewrite. The custom jigsaw code- `YungJigsawStructure`, `YungJigsawSinglePoolElement`, `JigsawStructureAssembler`- moved onto `Identifier.CODEC` and `StructureTemplate.JigsawBlockInfo` instead of the old NBT-and-string assumptions. That reads like a rename until you notice `YungJigsawSinglePoolElement` still preserves its custom selection-priority ordering (a comparator over `JigsawBlockInfo::selectionPriority`), which is the part that matters: it protects authored structure layout rules through the migration instead of just making the code compile.

Same theme downstream. A generated template can compile cleanly and still look wrong if its block states drift, so a lot of the port is state preservation. `ITemplateFeatureProcessor` in Bridges carries wall `NORTH/EAST/SOUTH/WEST`, `UP`, and `WATERLOGGED` across the renamed wall properties; `BlockReplaceProcessor` in Better End keeps wall connection semantics through `BlockStateProperties`. Better Strongholds has the sharpest safety diff- `LegProcessor` routes pillar placement through `setBlockStateSafe` instead of mutating the chunk directly, and `ArmorStandProcessor` / `ItemFrameProcessor` survive on NBT resilience (read the entity's `ArmorItems`, branch on the helmet, rebuild the tag). `BetterSpikeFeature` ports its spike template ids to `Identifier` and snaps the end crystals into place with `snapTo`.

Bridges is worth its own line because it ports as feature-based worldgen rather than a structure set. `BridgeFeatureConfig` moves its template ids onto `Identifier.CODEC`, `AbstractTemplateFeature` keeps the NBT-template-loading abstraction small and reusable, and the Fabric last mile is `BiomeModificationModuleFabric`: it injects the bridge placed-feature at `SURFACE_STRUCTURES` into any biome tagged `has_structure/bridge`.
