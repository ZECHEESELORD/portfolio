---
title: FruitCatch: osu!catch in Minecraft
image: /assets/fruitcatch/fruitcatch-10s.gif
published: 2026-05-10
github: https://github.com/ZECHEESELORD/FruitCatch
kind: experiment
tags: Paper, Game Design, Performance
role: Solo weekend project. Parser, timing model, input pipeline, audio, and match lifecycle.
stack: Java 25, Paper, SQLite, Display Entities, ffmpeg / JAVE
mono: "#f4c542, #e0962a"
initials: FC
---

"FruitCatch" is a small weekend project I decided to create during a particularly slow Saturday afternoon. It's a Paper plugin minigame that runs osu!catch beatmaps inside Minecraft 26.1.2. You're able to throw an actual `.osz` archive into the beatmaps folder, run `/fruitcatch import`, pick a difficulty from an ingame menu, and a solo run plays out on a vanilla display entity playfield. Project is not completed (I would like to implement multiplayer capabilities), so the source code is not available yet.

## At a glance

- Platform: Paper plugin, Minecraft 26.1.2
- Toolchain: Java 25, Gradle
- Beatmap input: user supplied `.osz` archives, osu!catch `Mode:2` only
- Catalog: SQLite (WAL) with extracted archive cache; `mtime+size` quick check, SHA-256 on miss
- Visuals: vanilla item, block, text, and interaction display entities. No custom model pack required for gameplay.
- Controls: invisible armorstand seat with horizontal aim driven by camera yaw
- Audio: per song resource pack generated and served by an in process HTTP server
- Rules scope: AR, CS, fruits, sliders (head/tail/repeats/ticks/tiny droplets), bananas, hits/misses, combo, accuracy, lazer-style scorev2 subset

## What's actually hard

Unfortunately, Minecraft was not built for rhythm games (sad). The server tick is 20 Hz (20 ticks per second) nominal, and under load it misses- sometimes badly (anyone play M7?). Display entities interpolate visually, yes, but the underlying state is still tick quantized. Players have a sandbox movement model with WASD, jump, and a free look camera, none of which map natively onto a 1D catcher. The client refuses to play arbitrary audio files on demand. And every run leaves behind exactly the kind of state- think entities, scheduled tasks, mounted seats, sent resource packs, arena reservations- that turns a minigame from "playable" into "needs a server restart."

Most of the engineering effort lives at those edges. The osu! gameplay rules are largely a porting problem. The timing model, the input pipeline, the audio delivery, and the run lifecycle are the actual work.

## The player flow

```text
.osz → /fruitcatch import → /fruitcatch join → pick difficulty
       → accept generated audio pack → 3-2-1 → play → result → cleanup
```

Behind that flow, the importer detects which archives have changed (mtime + size first, SHA-256 only when those move), extracts only the changed ones into a content keyed cache directory, parses every `Mode:2` `.osu` it finds, and writes the result into a SQLite catalog. Subsequent menu opens are paged reads against the catalog, not zip extractions.

That split (quick state check first, expensive parse only on miss) is what makes `/fruitcatch join` feel nice and reactive on a server with hundreds of imported maps. The catalog uses WAL journaling and a `ReentrantReadWriteLock`, so menus stay readable while a background refresh is rewriting changed archives.

## Beatmap parsing

The parser only accepts `Mode:2` files, while other rulesets in the same archive are skipped. It reads metadata, `[Difficulty]`, `[TimingPoints]`, hit samples, and `[HitObjects]`, then runs an osu!lazer-shaped postprocess pass:

- circles → fruit
- slider heads, repeats, and tails → fruit
- slider ticks → droplets
- legacy "tiny droplets" generated between ticks → tiny droplets
- spinners → bananas

Two pieces of that postprocess are direct ports from osu!, rather than reinventions. Banana and tiny-droplet horizontal positions use osu!'s `LegacyRandom` seeded with `1337`, because that is what osu! does and it is the only way the visual chart matches what a player has already seen on the original client. Hyper-dash detection uses lazer's distance-vs-time test more or less verbatim. We currently do not render the dash mechanic itself, but the data is computed and attached to each fruit, so when there is a reason to draw it the renderer is the only missing piece.

The output of all this is a sorted timeline of `CatchObject`s with absolute start times. That timeline is the authoritative source for the rest of the run. Display entities are presentation.

## Timing: two clocks, on purpose

The single most load-bearing decision in the project is that judgement time and visual time are separate.

The judgement clock (`SongClock`) is a thin wrapper over `System.nanoTime()`. It stores one `zeroNanos` reference (the moment in real time that maps to song-time zero) and reports elapsed song time as `(now - zeroNanos) / 1e6 + offset`. Intro skip is implemented by recomputing `zeroNanos` so the clock lands on the new audio position. There is no PID, no integrated tick delta, no smoothing. The clock cannot drift because nothing is integrating into it.

The visual clock (`VisualSongTime`) is a separate object that tracks what the *animation* should believe. Each tick it predicts forward by exactly 50 ms (one frame), then compares itself to the song clock and applies a bounded correction:

- drift ≤ 20 ms: ignore (dead band)
- drift ≥ 140 ms: snap to the song clock
- otherwise: nudge by at most 6 ms toward the song clock

The reason for two clocks is that a 200 ms hitch in the server tick is invisible to the player's audio (it is playing on the client) but very visible to fruit positions if they are redrawn straight off elapsed song time. The visual clock absorbs jitter; the song clock keeps timing honest. Hit detection samples the song clock, never the visual one. That split is the difference between "oh this is correctly timed rhythm" and "ah yes, "rhythm"."

The approach-rate preempt is osu!lazer's range (`PREEMPT_MIN/MID/MAX = 450 / 1200 / 1800 ms`) multiplied by a constant 1.15. The catch hitbox is lazer's catch width multiplied by 1.5 (Both multipliers are named, applied on top of the un-multiplied lazer math, and recoverable.) They exist from a balancing standpoint- Minecraft's "precision"  is a lot coarser than an osu! is, and the input device is a free look camera rather than a tablet. (During testing AR8+ maps were "technically" playable, but were kind of miserable to play.)

## Mouse control through a Minecraft body

The catcher is driven by the camera, not by movement keys. While a run is active, the player is mounted on an invisible, gravity-disabled armor-stand seat (`PlayerSeatRig`) and their look ray is projected onto the playfield plane each tick. The math is one ray-plane intersection in `CatcherAimProjector`:

- if the look direction is parallel to the plane (`|dz| < 1e-6`), no update
- if the intersection is behind the player (`distance ≤ 0`), no update
- otherwise the world-space hit X is mapped into osu!'s `[0, 512]` playfield range and clamped

Gameplay logic only consumes the normalized X. The mount, the seat reattaching after teleport, the canvas geometry, all live in the presentation layer. The same projector runs in unit tests with no Bukkit dependency.

The non obvious problem is sampling rate. Minecraft fires `PlayerMoveEvent` only when the camera actually moves, while judgement happens at exact, often inter-tick, song times. A `CatcherPositionSamples` deque keeps the last few seconds of `(time, x)` samples and answers "where was the catcher at time t?" by linear interpolation between the two bracketing samples. Without this, a player making a fast crossscreen flick misses fruit they visibly caught, because judgement runs against the catcher's position at the next tick rather than at the object's true judgement time. With it, judgement matches what the player saw.

## Audio: per-map resource packs

Minecraft will not play arbitrary `.mp3` files from a plugin folder (sadge), and bundling beatmap audio in the jar is both a copyright problem and an update problem. We build a one map resource pack at run time and ask the client to load it.

How it works, effectively:

1. Resolve the beatmap's declared audio file inside the extracted archive. Any path that escapes the archive's cache directory is rejected.
2. SHA-1 the audio- The hash is the asset name and the cache key: two beatmaps that ship the same audio share one pack.
3. If a converted `.ogg` for that hash does not exist, run the source through the audio converter. Files that are already `.ogg` copy through without re-encoding.
4. Zip up `pack.mcmeta`, `assets/fruitcatch/sounds.json`, and the audio. Hash the zip. Derive a deterministic UUID from `(audio-hash, pack-hash)` so identical packs are recognised by the client.
5. Register the pack with the in-process HTTP server (`com.sun.net.httpserver.HttpServer` -- no extra dependency) and `setResourcePack` it to the player.

The HTTP handler refuses anything that is not a `GET` to `/fruitcatch-packs/<filename>`, blocks `..`, `/`, and `\` in the filename, and serves `Cache-Control: public, max-age=31536000, immutable` so the client's pack cache does the right thing on rejoin. (This would be implemented a bit differently on a real minigames server)

A per player cache (`FruitCatchResourcePackCache`) tracks which pack a given player most recently loaded. For the scenario of "Same player, same beatmap, second run (maybe they missed a note or something, idk)": the download is skipped. For the scenario "Same player, different beatmap": the previous pack is removed before the new one is sent.

The converter itself is a small fallback chain. The default is JAVE's embedded ffmpeg, which is bundled only for Linux x64 and Windows x64; outside those platforms we fall back to an external `ffmpeg` on `PATH`, configurable per server. Embedded conversion fails are caught and retried against the external binary before surfacing an error.

If the first hit object is more than 7 seconds in, a second variant of the audio is rendered that starts 2 seconds before the first fruit, exposed ingame as the intro skip option. That variant is hashed and cached the same way as the full audio, under a deterministic filename, so it survives plugin restarts.

## Score: a working subset of lazer scorev2

`CatchScoreState` implements lazer's scorev2 model for the supported result set. The total is split between a combo portion and a tiny-droplet portion, weighted by how many tiny droplets the map actually contains, summing to 1,000,000 on a perfect run. Combo contribution is `300 · cappedLog(combo)` for fruit and `100 · cappedLog(combo)` for slider ticks, with the log capped at 200x. Bananas (gold bars) are bonus and do not affect accuracy.

Accuracy is computed against a running maximum-base-score total, not a hit count. That is the only way the number stays consistent with osu!'s definition once droplets and tiny droplets enter the mix.

This is not the full lazer scoring model (no HP drain, no mods, no grade), but the scorev2 scoring shape is faithful to the supported objects, and the unit tests pin the per object math against handcomputed cases.

## The match state machine

```text
PROVISION → QUEUE → RESOURCE_PACK → COUNTDOWN → PLAY → END → CLEANUP
```

`MatchPhase` permits only the listed transitions, and every illegal transition is logged. Each solo run owns its arena slot, its scheduled tasks (countdown, resourcepack timeout, end hold, cleanup hold, async pack preparation), its display entities, and its mount. `FruitCatchMatch.close()` cancels all of them, idempotently.

The reason we use a phase machine this explicit, is that the failure cases are where minigames usually get cooked. Players decline the resource pack. Players quit mid song. The audio pack future fails halfway through. The world reloads. Each of those paths takes a `failBeforePlay` or `cleanupMatch` route that returns the player to the lobby, removes the sent pack, releases the arena slot, cancels every outstanding `BukkitTask`, and removes every entity in the run's `ownedEntities` list.

It's also just a nice and intuitive way of thinking about things. Especially minigame logic.

## Personal offset

Every player gets a personal offset slider, clamped to ±100 ms, persisted (in memory, for now) per player. The displayed value is summed with a fixed `INTERNAL_OFFSET_MILLIS = -85` before being passed to the song clock. The internal constant is empirical- it is the value at which calibrated playtesters hit consistent zero-error judgements on test maps. It absorbs the constant component of the latency between Minecraft's audio pipeline and display-entity rendering on the client. 

## Tests

The unit tests are mostly concentrated where regressions would be silent- think `.osu` parsing, archive import (including unsafe-zip-entry rejection), AR/CS math, slider event generation, song clock seeking, catcher ray projection, sample interpolation at judgement time, hitbox intersection, score state, generated pack contents, audio-converter fallback, and match-phase transitions. Visual presentation is uncovered.
