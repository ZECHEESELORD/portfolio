---
title: FruitCatch: osu!catch in Minecraft
image: /assets/fruitcatch/fruitcatch-10s.gif
published: 2026-05-10
github: https://github.com/ZECHEESELORD/FruitCatch
kind: experiment
tags: Paper, Game Design, Performance
role: Solo weekend project.
stack: Java 25, Paper, SQLite, Display Entities, ffmpeg / JAVE
mono: "#f4c542, #e0962a"
initials: FC
summary: I made Minecraft import real .osz files, generate the song pack, and judge osu!catch through a 20 Hz server loop.
---

FruitCatch happened during a slow Saturday afternoon. I wondered how much of osu!catch could survive being shoved through a Minecraft server, then made the mistake of checking.

FruitCatch is a Paper minigame for Minecraft `26.1.2`. Drop an `.osz` archive into the beatmaps folder, run `/fruitcatch import`, choose a difficulty, accept the generated audio pack, and play the map on a display-entity field. Solo runs work. Multiplayer is the next large piece, and the source will be released after cleanup.

```text
.osz → /fruitcatch import → /fruitcatch join → pick difficulty
       → accept generated audio pack → 3-2-1 → play → result → cleanup
```

Minecraft gives me a 20 Hz server loop, a free-look camera, and no API for playing an arbitrary song file. That toybox was enough to make the project interesting in several avoidable ways. See below.

## Importing real beatmaps

The importer scans user-supplied `.osz` archives and checks `mtime + size` first. A changed archive gets SHA-256 hashed, extracted into a content-keyed cache, parsed, and written into SQLite. Unchanged archives skip extraction and parsing. Menus read from the catalog, so opening `/fruitcatch join` does not turn into zip-file archaeology once the server has hundreds of maps.

SQLite runs in WAL mode behind a `ReentrantReadWriteLock`. A background refresh can replace changed catalog entries while player menus continue reading the last committed state.

Only osu!catch maps with `Mode:2` are accepted. The parser reads metadata, difficulty values, timing points, hit samples, and hit objects, then builds the catch timeline:

- circles become fruit;
- slider heads, repeats, and tails become fruit;
- slider ticks become droplets;
- legacy tiny droplets are generated between ticks;
- spinners become bananas.

Banana and tiny-droplet X positions use osu!'s `LegacyRandom` with seed `1337`. Hyper-dash detection follows lazer's distance-versus-time check. Those details matter because players already know what the chart looks like in osu!; changing the random placement produces a different map wearing the same title.

The parser outputs a sorted timeline of `CatchObject`s with absolute start times. Scoring and judgement consume that timeline directly. Display entities are free to be late and pretty.

## Timing with a server that occasionally forgets time

Audio plays on the client. Judgement runs on the server. A Minecraft tick nominally lasts `50 ms`, then lag happens and the tick develops personal plans.

So FruitCatch uses two clocks.

`SongClock` wraps `System.nanoTime()`. It stores the real-time instant corresponding to song time zero and reports:

```text
(now - zeroNanos) / 1e6 + offset
```

Intro skip recomputes `zeroNanos` for the new audio position. The clock does not accumulate tick deltas, so a slow server tick cannot permanently move the song timeline.

`VisualSongTime` controls animation. Each tick it predicts `50 ms` forward, compares itself with `SongClock`, and corrects the difference:

- drift up to `20 ms`: leave it alone;
- drift from `20 ms` to `140 ms`: move at most `6 ms` toward the song;
- drift above `140 ms`: snap.

A `200 ms` server hitch therefore gets absorbed gradually, and the fruit stay on a smooth path. Judgement still samples `SongClock`, so smoothing the animation never widens or shifts the hit window.

The approach rate preempt uses osu!lazer's `450 / 1200 / 1800 ms` range multiplied by `1.15`. Catch width uses lazer's value multiplied by `1.5`. Minecraft camera input is much coarser than tablet movement; unadjusted AR8+ maps were technically playable in the least enjoyable sense of the word.

## Driving the catcher with camera movement

The player sits on an invisible, no gravity armor stand while a run is active. Each camera update projects the look ray onto the playfield plane:

- `|dz| < 1e-6`: the ray is parallel, so keep the previous position;
- intersection distance at or below zero: the plane is behind the player;
- otherwise: map the world-space X coordinate into osu!'s `[0, 512]` range and clamp it.

Gameplay only sees the normalized X coordinate. Mount management, teleports, and display geometry stay in the Minecraft layer. `CatcherAimProjector` itself has no Bukkit dependency and runs in unit tests.

Sampling rate caused the less obvious bug. `PlayerMoveEvent` arrives when the camera moves. Judgement can occur between those events at an exact song time. Reading the latest catcher position makes a fast cross screen flick land one tick late even when the fruit visibly overlaps the catcher.

`CatcherPositionSamples` keeps a short deque of `(time, x)` samples. Judgement asks for the catcher position at the object's timestamp, then linearly interpolates between the surrounding samples. The server grades the position the player moved through at that timestamp. The next tick no longer gets to rewrite history.

## Generating audio packs

Minecraft will not load arbitrary `.mp3` files from a plugin directory. FruitCatch builds one resource pack per unique audio file and serves it through a small in-process HTTP server.

The pipeline is:

1. Resolve the declared audio path inside the extracted archive. Paths escaping the cache directory are rejected.
2. SHA-1 the source audio. The hash becomes the asset name and conversion cache key.
3. Convert to `.ogg` through JAVE's embedded ffmpeg, then fall back to an external `ffmpeg` on `PATH` when needed. Existing `.ogg` files copy directly.
4. Build `pack.mcmeta`, `sounds.json`, and the audio into a zip. A deterministic UUID is derived from the audio and pack hashes.
5. Serve the pack and send it with `setResourcePack`.

The HTTP handler accepts `GET` requests under `/fruitcatch-packs/<filename>`, rejects path separators and traversal, and sends long lived immutable cache headers. Identical audio produces the same pack identity, so the client cache works across retries and rejoins.

A per-player cache remembers the last loaded pack. Replaying the same map skips the download. Switching maps removes the old pack before sending the next one.

## Score and personal offset

`CatchScoreState` implements the supported portion of lazer scorev2. Comboable objects and tiny droplets contribute through separate weighted portions that sum to `1,000,000` on a perfect run. Bananas are bonus objects and do not affect accuracy.

Accuracy uses the running maximum base score, which keeps droplets and tiny droplets aligned with osu!'s result model. HP drain, mods, and grades are still outside the current ruleset.

Each player also gets a personal offset from `-100 ms` to `+100 ms`. It is added to `INTERNAL_OFFSET_MILLIS = -85`, the empirical constant where calibrated playtesters produced centered judgement errors. That value absorbs the stable portion of the latency between client audio and display-entity presentation.

## Cleaning up the minigame-shaped crime scene

Every run moves through an explicit phase machine:

```text
PROVISION → QUEUE → RESOURCE_PACK → COUNTDOWN → PLAY → END → CLEANUP
```

A match owns its arena slot, scheduled tasks, resource-pack timeout, async conversion future, displays, mount, and every spawned entity. `FruitCatchMatch.close()` cancels and removes them idempotently.

The minigame usually gets cooked in its failure paths. Players decline the pack, quit during countdown, disconnect mid-song, lose the world, or hit an ffmpeg failure halfway through preparation. Every path returns the player, removes the sent pack, releases the arena, cancels Bukkit tasks, and clears `ownedEntities`.
