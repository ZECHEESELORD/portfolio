---
title: Bringing Castle Siege back for Brawl
published: 2026-08-13
featured: 4
kind: client
tags: Server Systems, Game Design
role: Developer on the Mineplex team.
stack: Java, Mineplex, Minecraft
mono: "#4c775e, #c77970"
initials: CS
summary: Reviving Castle Siege for Mineplex Brawl, with mission races, TNT attribution, and summon targeting.
---

I worked on getting Castle Siege ready for Brawl, which meant adding missions, raising the player limit, and tracing old behavior that became less cooperative once we started changing things around it.

## Nine missions on a five-slot board

When QA found a board showing `4/9` completed, the menu was reporting actual assignments: two requests could read the same board before either finished writing, so both decided there was room. Generation had to take turns while preserving completed missions, since wiping progress would make the database tidier at the player's expense.

## TNT attribution got weird

Giving TNT a player owner exposed an interaction between the carrier's death transition and the damage rules, requiring us to separate kill credit from damage permission. Some explosions were also credited to a stone axe, which was ambitious of it.

## Let Minecraft navigate

For summons, I let Minecraft handle navigation while my targeting rules decided whether to pursue a living Defender or return to the owner. If the owner disappeared, the summon needed cleaning up rather than another movement instruction.

After Castle Siege shipped into Brawl, I wrote about these bugs for players in [Dev Chats #1: Bringing Castle Siege Back for Brawl](https://mineplex.com/threads/dev-chats-1-bringing-castle-siege-back-for-brawl.23542/).
