# A push re-checks pause and view AFTER the render, not just before

- **Status:** Accepted
- **Date:** 2026-09-09
- **Type:** Correctness
- **Supersedes:** —
- **Superseded by:** —

## Decision

`pushDevice` reads the pause switch and the active view **twice**: once before it
starts rendering, and again after the render returns, immediately before it
publishes. If either changed, the frame is dropped rather than published.

The view is also **pinned**. `pushDevice` captures the active view before the
render, passes it into `renderDevice`, and publishes that same name to the
retained `view` topic. Before, the view was read once for the render and again
for the log line and the topic, so a switch mid-render made the published name
describe bytes that were never rendered.

Separately, the boot-time "populate each image entity with a first frame" push
now waits `RETAINED_SETTLE_MILLISECONDS` (5 s), the same window the config-default
seeding already used. That removes the wasted renders; the post-render re-check
is what makes it correct.

## Context

Three deploys on 2026-09-08 each pushed a wrong frame to the Kitchen Counter and
Living Room Mantle displays, both of which were paused. The owner had been
seeing it for a while:

> Yes fix. That explains the issue I keep seeing.

I twice reported the cause as "the server renders before the retained MQTT
topics arrive". That was the right neighborhood and the wrong mechanism, and
the log disproves it:

```
04:16:25.347  skip eink-6e6697 (updates paused)     <- retained OFF had arrived
04:16:40.951  push eink-6e6697 (Photo Frame (Duo), 9913 bytes)   <- pushed anyway
04:16:59.597  skip eink-6e6697 (updates paused)     <- and was paused again
```

The pause was known at 04:16:25, forgotten at 04:16:40, and known again at
04:16:59. Nothing re-enabled it. The boot push had called `pushDevice` *before*
04:16:25, passed the pause check against the default (`updates` defaults to
true, and the retained value had not landed), then spent 15 s inside
`await renderDevice(...)` — five cold Chromium renders — and published on the
far side of a check that was by then 15 seconds stale.

A paused display is never pushed to again, so it holds that wrong frame until a
person intervenes. That is why it looked like the panel "got stuck".

## Why

The window is not closable by waiting. MQTT has no end-of-retained signal, so
any pre-render delay is a guess, and a render is slow enough that the owner can
also pause a display or switch its view by hand while one is in flight. The
check has to happen where the decision is acted on — immediately before the
publish — and the delay is only an optimization that avoids five pointless cold
renders.

Dropping the frame is safe because whatever changed the state has already queued
its own push: the `updates` and `view` knobs both call `pushDevice` in
`onApplied`.

## Evidence

Two tests in `packages/server/src/pushController.test.ts` mutate the store from
*inside* the fake render, which is what Home Assistant does on a restart. Both
were confirmed to fail against the pre-fix `pushController.ts` and pass after:

- `a pause that lands mid-render drops the frame`
- `a view switch mid-render drops the now-stale frame`
