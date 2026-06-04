---
title: Paper Open Source Work
image: /assets/papermc-oss/hero.png
published: 2025-06-26
github: https://github.com/ZECHEESELORD
---

# Debugging a PLAY -> CONFIG handoff bug across Velocity and Paper

This started as one bug report and ended as two upstream fixes.

The visible failure was simple enough: re-entering Minecraft's configuration phase from play could disconnect a client behind Velocity. The repro path was also blessedly direct. Join through Velocity, force the client into configuration, force it back to play, and watch the backend complain about a packet it did not expect. The original issue reported vanilla and Minestom failures, with latency making the problem easier to trigger.

At the start, I assumed the bug lived in Velocity's packet queueing. That was a reasonable assumption. It was also incomplete, which is where most of the useful learning happened.

The final result was two merged PRs:

- [PaperMC/Velocity #1747](https://github.com/PaperMC/Velocity/pull/1747), merged April 8, 2026: use outbound-only queueing when re-entering configuration.
- [PaperMC/Paper #13712](https://github.com/PaperMC/Paper/pull/13712), merged April 25, 2026: reset pending keepalive state on listener handoff during reconfiguration.

The line count is the boring part. What makes this worth writing up is where the bug lived: connection lifecycle code, the layer underneath gameplay. State was leaking across a protocol boundary- a quieter failure mode than a missing command check or a typo'd event handler, and a more interesting one to chase.

## The actual bug report

Minecraft now has a configuration phase that can exist outside initial login. In the happy path, a server can move a client from PLAY back into CONFIG, complete whatever needs to happen there, and return the client to PLAY. Behind a proxy, that means the proxy, backend, client, packet queues, encoders, decoders, and keepalive handling all have to agree about what phase the connection is in.

The issue report pointed at queued PLAY traffic being replayed at the wrong time. When the client entered CONFIG, Velocity could queue received PLAY packets. When the backend finished configuration, those queued packets could flush before the client had actually acknowledged the phase switch. The backend then decoded a PLAY packet while expecting CONFIG traffic. Very fun, in the same way a smoke alarm at 4 AM is technically useful.

That gave me the first fix target: the proxy should not treat a connected PLAY -> CONFIG transition like a normal play connection.

## The Velocity-side fix

Velocity already had play packet queueing for state transitions. The problem was that the connected reconfiguration path needed different ownership rules. During PLAY -> CONFIG, the proxy still needs to prevent outgoing PLAY packets from reaching the client after update start, but it should not keep queueing serverbound PLAY traffic and replaying it after the handoff.

The PR changed that behavior in three places:

1. `MinecraftConnection#setState` distinguishes a connected PLAY -> CONFIG reconfiguration from a normal transition. For that path, it installs only the outbound play packet queue.
2. `ClientPlaySessionHandler` only forwards generic or unknown client packets when the backend connection is open, the server connection phase is complete, and the backend is actually in PLAY.
3. `ConnectedPlayer` only forwards keepalives when the client and backend states match, and only when that state is CONFIG or PLAY.

The important part is the directionality. Outbound queueing still protects the client from stale PLAY traffic. Inbound queueing is the dangerous part during reconfiguration, because replaying old client traffic after a phase boundary can manufacture impossible packet order.

That fixed one real class of failure. It also exposed the second one.

## The assumption that broke

My first working model was basically: Velocity is replaying packets at the wrong time, so the backend disconnects. Once the proxy stops doing that, the issue should go away.

After the Velocity patch, the failure mode changed. Under latency, the backend could still disconnect, but the logs no longer supported the idea that Velocity had dropped or reordered the relevant keepalive reply. The backend was receiving the reply. It was rejecting it.

That was the point where the debugging stopped being "fix the proxy queue" and became "draw the state machine until it embarrasses itself."

My old notes on this work used the phrase "pure brute force try try try again." That is accurate, with one caveat: the brute force was controlled. The same loop every time, changing one variable- run the repro, add latency, log the listener boundary, log the expected keepalive ID, log the received keepalive ID, reset, repeat.

The signal was eventually clear: Paper's CONFIG listener was inheriting a pending PLAY keepalive expectation during listener handoff.

## The Paper-side bug

Paper had improved keepalive tracking with a `KeepAlive` object that carried ping history and pending challenge state. Within a single listener, that object was the right design. The trouble started when the same pending challenge rode along across a PLAY -> CONFIG listener handoff.

The failing sequence looked like this:

```text
PLAY listener sends keepalive A
Paper hands the connection from PLAY to CONFIG
CONFIG listener inherits the pending expectation for A
CONFIG listener sends keepalive B
Client replies to B
Paper still thinks A is outstanding
B is rejected as stale or out-of-order
Player disconnects with timeout
```

The fix in [Paper #13712](https://github.com/PaperMC/Paper/pull/13712) was intentionally narrow. `KeepAlive` gained a `copyForListenerHandoff()` method. The copy preserves ping history and latency calculators, but it does not preserve the in-flight keepalive challenge. `ServerCommonPacketListenerImpl#createCookie(...)` then passes that listener-handoff copy into the next listener.

That distinction was the whole fix:

- keep latency and ping history because they describe the connection;
- reset pending keepalive expectations because they belong to a specific listener phase.

This is also where I had to correct another assumption. I originally treated "the keepalive object follows the player" as obviously good because ping history following the player is useful. The bug was hidden in that word "object." One object was carrying two kinds of state with different lifetimes. History could survive a handoff. A pending challenge could not.

## Testing the fix

The repro was small enough to run locally but timing-sensitive enough to be annoying. The original issue noted that latency made it easier to trigger, so I tested with added latency, since a clean localhost path would have hidden the bug.

Before the Paper-side fix, repeated config/unconfig cycles eventually failed. Backend logs showed CONFIG keepalive replies being rejected because the old PLAY expectation was still present.

After the Paper-side fix, I could not reproduce the disconnect at:

- 0 ms added latency
- 200 ms added latency
- 800 ms added latency

Those numbers were never going to be universal proof; they were there to test the failure under the conditions that produced it before. Protocol bugs often look fake when everything runs on localhost and then become very real once the network has the audacity to behave like a network.

## What I would do differently

I would split the investigation mentally earlier.

The first mistake was treating the issue as one broken component. In reality, Velocity and Paper each had a separate state ownership problem. Velocity needed stricter forwarding and queueing rules. Paper needed to stop carrying a pending keepalive challenge across listener handoff. Either fix was useful by itself. The full failure needed both.

The second mistake was trusting the apparent shape of the first repro too much. The issue report correctly identified packet queueing as suspicious, and that sent me to the right area of Velocity. It also made it easy to overfit the diagnosis. Once a theory explains the first log line, it is tempting to make every later log line confess to the same crime.

The third mistake was starting too high-level. The logs that mattered were boring and specific: previous phase, next phase, expected keepalive ID, received keepalive ID, listener handoff point. Once those were visible, the bug stopped being mysterious. It was still annoying, which is different.

There was also the usual upstream tax. Paper is a patch-stack repository, so the change had to land in the right patch file and preserve patch headers. Unglamorous, and part of the job- a correct fix in the wrong shape is still friction for maintainers.

## Where the state lived

No player-facing feature came out of this, and no menu got prettier. The change is entirely about how a proxy and backend preserve protocol boundaries during a live phase transition, which means the real work was following state across the whole chain:

```text
client <-> Velocity client connection <-> Velocity backend connection <-> Paper listener
```

Each layer had its own idea of phase, queue ownership, keepalive ownership, and handoff timing. The fixes came out small because the debugging had to be precise- once you can see where state is allowed to live, the edit is usually a few lines.

When state crosses a boundary it has no business crossing, the game does not always fail loudly. Sometimes it waits for latency, sends one perfectly valid packet at the worst possible time, and lets you explain to yourself why "impossible" just happened again.
