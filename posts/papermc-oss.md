---
title: Fixing PLAY -> CONFIG across Velocity and Paper
published: 2026-04-26
github: https://github.com/PaperMC/Velocity/issues/1723
kind: oss
tags: Velocity, Paper, Networking, Protocols
role: Open source contributor. Protocol debugging and upstream patch authoring across Velocity and Paper.
stack: Java, Velocity, Paper, Netty, Minecraft protocol
mono: "#b6d4bd, #6f9d78"
initials: PV
summary: Two merged fixes for stale packet and keepalive state during live Minecraft reconfiguration.
---

One reproduction turned into two merged fixes. Velocity was replaying client traffic after a protocol boundary, and Paper was carrying an in-flight keepalive challenge into the next packet listener. Both could break a live `PLAY -> CONFIG -> PLAY` transition, especially when latency widened the handoff window.

The proxy fix landed in [Velocity #1747](https://github.com/PaperMC/Velocity/pull/1747). The listener fix landed in [Paper #13712](https://github.com/PaperMC/Paper/pull/13712). Finding them meant following the same transition through the client connection, Velocity's backend connection, and Paper's listener handoff.

## Reproducing the handoff

[Velocity issue #1723](https://github.com/PaperMC/Velocity/issues/1723) came with a small repro: join a backend through Velocity, enter configuration, then return to play.

```text
debugconfig config <player>
debugconfig unconfig <uuid>
```

The backend would sometimes decode a PLAY packet while it still expected CONFIG traffic. Vanilla reported an unknown packet ID; Minestom reported an unregistered one. Adding latency made the failure much easier to hit.

The phase existed independently at every hop:

```text
client <-> Velocity client connection <-> Velocity backend connection <-> Paper listener
```

I kept the action sequence fixed, varied the added latency, and logged the state on each side of the handoff. The first bad ordering was in Velocity: serverbound PLAY traffic could wait in an inbound queue, then flush after configuration as if it were still current.

## Velocity: queue one direction

Velocity has separate inbound and outbound PLAY packet queues. Full queueing is useful during an initial connection, but a connected reconfiguration has a different constraint. Outbound PLAY packets must wait once the client enters CONFIG. Inbound PLAY packets must not survive the boundary and reappear afterward.

Replaying serverbound traffic changes its meaning. A movement or attack packet can describe a world state that no longer exists by the time it arrives.

The merged change makes that distinction inside `MinecraftConnection#setState`:

```java
if (previousState == StateRegistry.PLAY
    && this.pendingConfigurationSwitch
    && this.association instanceof ConnectedPlayer) {
  addPlayPacketQueueOutboundHandler();
} else {
  addPlayPacketQueueHandler();
}
```

That branch also prevents the codec state change from reinstalling the full queue. The same outbound-only helper is used when `ConnectedPlayer` begins the switch.

Generic and unknown packets bypassed the typed path, so their forwarding code also checked the backend's real state:

```java
final boolean stateAllowsForward = smc != null
    && !smc.isClosed()
    && serverConnection.getPhase().consideredComplete()
    && smc.getState() == StateRegistry.PLAY;
if (stateAllowsForward) {
  smc.write(buf.retain());
}
```

The `ByteBuf` is retained only on the forwarding path, where ownership passes to the backend channel. Keepalives use a stricter gate: the client and backend states must match, and that state must be CONFIG or PLAY. If Velocity removes a ping ID from its pending map, the handler still reports the packet as handled even when a phase mismatch prevents forwarding. A packet already claimed by that map must not fall through into unrelated handling.

## Tracing the second failure

The Velocity patch removed the stale packet replay, but latency could still produce a backend timeout. This time the backend received the keepalive response. It rejected it.

I repeated the same transition while logging the previous listener, next listener, expected keepalive ID, and received ID. The failing sequence settled into five steps:

```text
PLAY sends challenge A
listener handoff moves the connection to CONFIG
CONFIG inherits A, then sends challenge B
the client replies to B
Paper still has A at the head of the pending queue and rejects B
```

The proxy was no longer losing or reordering B. Paper's CONFIG listener had inherited an in-flight challenge created by the PLAY listener.

Paper's tracker permits several challenges in flight, so ordering matters. A reply matching a later queue entry is treated as out of order.

## Paper: split state by lifetime

Paper's `KeepAlive` object held useful connection history and listener-specific pending work in the same object. Those fields needed different handoff rules.

| State | Lifetime | Listener handoff |
| --- | --- | --- |
| `lastKeepAliveTx` and ping calculators | Connection | Copy |
| `pendingKeepAlives` | Current listener phase | Reset |

The fix creates a fresh tracker and copies only the history:

```java
public KeepAlive copyForListenerHandoff() {
    KeepAlive copy = new KeepAlive();
    copy.lastKeepAliveTx = this.lastKeepAliveTx;
    copy.pingCalculator1m.copyFrom(this.pingCalculator1m);
    copy.pingCalculator5s.copyFrom(this.pingCalculator5s);
    return copy;
}
```

`pendingKeepAlives` is intentionally absent. Each ping calculator copies its response entries and aggregate values into a new calculator, so the next listener keeps latency history without sharing the old listener's mutable queues. `createCookie(...)` on `ServerCommonPacketListenerImpl` passes that copy into the next listener.

Paper stores source changes as a patch stack, so the PR updated the existing keepalive feature patch and its headers rather than adding a loose source edit.

## Testing both patches

I ran repeated configuration cycles with both patches at 0, 50, 100, 500, and 800 ms of added latency. Added latency widened the ordering window that made the original failure reproducible.

I also checked the state at each boundary. Velocity had to avoid installing the inbound PLAY queue during connected reconfiguration. Generic packets had to stop at a closed, incomplete, or non-PLAY backend. Keepalives could cross only while both sides agreed on CONFIG or PLAY. On Paper, the new CONFIG listener needed an empty pending queue while retaining the existing ping history.

After both patches, Velocity no longer replayed old serverbound PLAY traffic, and Paper no longer let challenge A survive long enough to invalidate B. Repeated transitions stayed connected across the tested latency range.
