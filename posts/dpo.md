---
title: DPO: making datapacks ask less often
image: /assets/dpo/title.svg
published: 2026-10-06
featured: 3
kind: case
tags: Paper, Datapacks, Server Systems, Performance, Tooling
role: Architecture and implementation.
stack: Java, Paper 1.21.11, Brigadier, Datapack Functions, Scoreboards
mono: "#6fa79b, #bc7470"
initials: DPO
summary: A datapack optimizer that recognizes a narrow set of score-polling loops, checks whether it can replace them, and leaves the rest to Minecraft.
---

A datapack timer can spend every tick incrementing a score for every online player, then scan those same players to see whether anyone has reached the threshold. If the action only needs to run once every hundred ticks, that is a lot of work spent establishing that it is not time yet.

Datapack Optimizer (DPO) recognizes two score-based families where some of that work can be replaced: authoritative player scans and counter loops that can use logical deadlines. I have kept those mechanisms narrow because a score can be read by something other than the function that updates it, and skipping an apparently redundant update becomes a behavior change as soon as another reader notices.

## Read the stack Minecraft actually loaded

Looking through one datapack folder would be a poor starting point, since another enabled pack might override its functions and function tags can bring additional work into the tick loop. Before deciding what to optimize, I need to resolve the program Minecraft is actually running from the complete enabled stack.

DPO captures that stack in priority order and indexes the winning functions, tags, command occurrences, and calls, then follows the invocation contexts to work out what those commands can affect. A function that does nothing except call another function may still reach a scoreboard write several calls later, so the analysis carries those effects back through the call paths rather than treating each file in isolation.

![DPO's pipeline: resolve the enabled stack, analyze effects, plan candidates, stage a dormant bundle, and activate only after installed-provider and vanilla-evidence checks. Rejected work stays native.](/assets/dpo/architecture.svg)

Before replacing a loop, the planner checks the assumptions the proposal depends on, the effects that could invalidate it, and whether the runtime supports the replacement. Its decision report records those checks, so if another function reads the objective, I can see why the loop stayed native rather than wonder why nothing activated.

## A counter that mostly counts to itself

Here is an illustrative supported shape, with a dummy objective declared by the load function and `demo:timer` called directly from the tick root:

```mcfunction
# demo:timer
scoreboard players add @a pulse 1
execute as @a if score @s pulse matches 100.. run function demo:action

# demo:action starts with
scoreboard players set @s pulse 0
```

In the native version, every tick updates each player's counter and tests the threshold, even when nobody is close to reaching it. The deadline version advances a logical epoch and tracks which players are due, materializing their scores before running the original action at the position where the datapack would have called it.

![Native polling touches each player on every tick. An eligible deadline loop advances an epoch and materializes due players before invoking the original action.](/assets/dpo/deadline.svg)

This runs inline with function execution in the server runtime rather than as a replacement command pasted into the datapack. A separate scheduler would be convenient, but moving the action into another phase could change its ordering relative to the surrounding commands, even if it still ran on the correct tick.

The recognizer requires this particular shape: an increment of one, a positive open-ended threshold, bare `@a`, direct function calls, and a reset-to-zero as the action's first command. It also checks the call paths, objective declaration, and other modeled accesses, so changing the selector or reading the counter elsewhere can leave an otherwise similar loop on the native path.

## Someone else might be reading that score

The counter can stay virtual between observation points, which means its physical scoreboard value need not change on every tick. That is fine for an internal timer under the required assumptions, but it would be very noticeable to a plugin that expected to read the updated value directly from the scoreboard.

I require explicit consent from every affected pack for this aggressive transformation, alongside the assumptions about external and unmodeled accesses. Without that consent and those conditions, the loop stays native. Even with consent, save and clean-transition barriers have to write the logical values back before the runtime state disappears, or saving the world could preserve the last physical score instead of the value the timer had reached.

## A reload is a different program

The compiled bundle starts dormant because finding a candidate in the captured stack does not prove that the same providers were installed successfully. Activation checks their identities and order against matching vanilla parse evidence and a positive lifecycle signal, leaving execution native if that qualification fails.

A reload retires the preceding generation, but an invocation exposed by that generation still retains its own native boundary. Letting it borrow whichever optimized runtime loaded most recently could send an old invocation through a plan compiled for a different stack, so the generation stays attached to the execution path rather than being looked up as global current state.

Fault handling has to account for how much of the invocation has already happened: before any observable effect, the runtime can fall back and replay the native path, but after an effect that same retry could run the action twice. I keep those cases separate so a failure in the optimizer does not turn into a second execution of work the datapack already performed.
