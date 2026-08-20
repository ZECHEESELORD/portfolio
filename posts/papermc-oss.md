---
title: Fixing PLAY -> CONFIG across Velocity and Paper
published: 2026-04-26
github: https://github.com/PaperMC/Velocity/issues/1723
kind: oss
tags: Velocity, Paper, Networking, Protocols
role: External contributor across Velocity and Paper.
stack: Java, Velocity, Paper, Netty, Minecraft protocol
mono: "#b6d4bd, #6f9d78"
initials: PV
summary: One reconfiguration bug turned out to be two bugs, one in each half of the handoff.
---

So Velocity replayed stale client traffic after a protocol boundary. Paper carried an in-flight keepalive challenge into the next packet listener. Either bug could break a live `PLAY -> CONFIG -> PLAY` transition, especially once latency widened the handoff window.

The proxy fix landed in [Velocity #1747](https://github.com/PaperMC/Velocity/pull/1747). The listener fix landed in [Paper #13712](https://github.com/PaperMC/Paper/pull/13712). Finding both meant following the same transition through the client connection, Velocity's backend connection, and Paper's listener handoff.

## Reproducing the handoff

[Velocity issue #1723](https://github.com/PaperMC/Velocity/issues/1723) came with a small repro: join a backend through Velocity, enter configuration, then return to play.

```text
debugconfig config <player>
debugconfig unconfig <uuid>
```

The backend would sometimes decode a PLAY packet while it still expected CONFIG traffic. Vanilla reported an unknown packet ID; Minestom reported an unregistered one. Added latency made the failure much easier to hit.

The phase exists independently at every hop:

```text
client <-> Velocity client connection <-> Velocity backend connection <-> Paper listener
```

I kept the action sequence fixed, varied the added latency, and logged state on each side of the handoff. The first bad ordering appeared in Velocity. Serverbound PLAY traffic could wait in an inbound queue, then flush after configuration with its old meaning attached.

## Velocity: queue one direction

Velocity has separate inbound and outbound PLAY packet queues. During an initial connection, queueing both directions is useful. A connected reconfiguration has stricter rules. Outbound PLAY packets wait once the client enters CONFIG. Old inbound PLAY packets get dropped at the boundary.

Replaying serverbound traffic changes its meaning. A movement or attack packet can describe a world state that has already disappeared by the time the backend sees it.

The merged change handles that distinction inside `MinecraftConnection#setState`:

```java
if (previousState == StateRegistry.PLAY
    && this.pendingConfigurationSwitch
    && this.association instanceof ConnectedPlayer) {
  addPlayPacketQueueOutboundHandler();
} else {
  addPlayPacketQueueHandler();
}
```

That branch also prevents the codec state change from reinstalling the full queue. `ConnectedPlayer` uses the same outbound-only helper when it begins the switch.

Generic and unknown packets bypassed the typed path, so their forwarding code also checks the backend's current state:

```java
final boolean stateAllowsForward = smc != null
    && !smc.isClosed()
    && serverConnection.getPhase().consideredComplete()
    && smc.getState() == StateRegistry.PLAY;
if (stateAllowsForward) {
  smc.write(buf.retain());
}
```

The `ByteBuf` is retained only when ownership passes to the backend channel. Keepalives use a stricter gate: client and backend states must match, and that state must be CONFIG or PLAY. Once Velocity claims a ping ID from its pending map, the handler reports the packet as handled even when the phase gate blocks forwarding. Otherwise the packet can fall through into unrelated handling.

## The second failure

The Velocity patch stopped stale PLAY traffic. With enough latency, the backend could still time out.

This time the keepalive response arrived. Paper rejected it.

I repeated the transition while logging the previous listener, next listener, expected keepalive ID, and received ID. The failure settled into five steps:

```text
PLAY sends challenge A
listener handoff moves the connection to CONFIG
CONFIG inherits A, then sends challenge B
the client replies to B
Paper still has A at the head of the pending queue and rejects B
```

Velocity was delivering B correctly. Paper's CONFIG listener had inherited an in-flight challenge created by the PLAY listener.

Paper's tracker permits several challenges in flight, so ordering matters. A reply matching a later queue entry is treated as out of order.

## Paper: give state the right lifetime

Paper's `KeepAlive` object held connection history and listener-specific pending work together. Those fields need different handoff behavior.

| State | Lifetime | Listener handoff |
| --- | --- | --- |
| `lastKeepAliveTx` and ping calculators | Connection | Copy |
| `pendingKeepAlives` | Current listener phase | Reset |

The fix creates a fresh tracker and copies the history:

```java
public KeepAlive copyForListenerHandoff() {
    KeepAlive copy = new KeepAlive();
    copy.lastKeepAliveTx = this.lastKeepAliveTx;
    copy.pingCalculator1m.copyFrom(this.pingCalculator1m);
    copy.pingCalculator5s.copyFrom(this.pingCalculator5s);
    return copy;
}
```

The copy omits `pendingKeepAlives`. Each ping calculator copies its response entries and aggregate values into a new calculator, so the next listener keeps latency history without sharing the old listener's mutable queue. `createCookie(...)` on `ServerCommonPacketListenerImpl` passes that copy into the next listener.

Paper stores source changes as a patch stack, so the PR updated the existing keepalive feature patch and its headers.

## Testing both patches

I ran repeated configuration cycles with both patches at 0, 50, 100, 500, and 800 ms of added latency. The higher values widened the timing window and made the original ordering failures easy to reproduce.

I also checked each boundary directly. Velocity avoided installing the inbound PLAY queue during connected reconfiguration. Generic packets stopped at closed, incomplete, or non-PLAY backends. Keepalives crossed only while both sides agreed on CONFIG or PLAY. Paper's new CONFIG listener began with an empty pending queue and retained its ping history.

With both patches applied, repeated transitions stayed connected across the tested latency range.
