# Shared frame cache and instant image-stream navigation — plan

Status: in progress (2026-10-23). Decision:
[`2026-10-23-a-cached-frame-is-keyed-by-what-changes-its-pixels`](decisions/2026-10-23-a-cached-frame-is-keyed-by-what-changes-its-pixels.md).

## Goal

An image-stream panel (a 480×480 Presto, the 480×320 WT32) switches views as fast as
a browser panel, never shows a loading state, and plays a shared camera view as fast
as the panel can draw. Work that several panels share is done once.

## What the time goes to today

Measured on a 480×480 Presto stream (2026-10-22 and 2026-10-23):

| Step | Time |
| --- | ---: |
| Stream browser builds the destination view after the swipe | ~0.6 s |
| Capture + RGB565 encode in the worker | ~0.05 s |
| Board: inflate a full changed frame (miniz) | ~0.15 s |
| Board: draw a full changed frame to the panel | ~0.37 s |
| Request to first changed-frame acknowledgement | 0.8–1.5 s |

Loading states were also sent as frames, each costing the board ~0.5 s before the real
view; #297 holds them back.

**Correction (2026-10-23, measured).** The ~0.6 s "builds the destination view" row is
wrong for every swipe a panel makes today. In a browser with the worker's exact context
(480×480, scale 1, touch, mobile, reduced motion) against the e2e server, timed from the
`touchEnd` the worker dispatches:

| Swipe | Loading state shown | New view in the DOM and settled |
| --- | ---: | ---: |
| Native view (Now Playing, Queue, Calendar, Ambient), 5 runs | 15–27 ms | 33–67 ms |
| Composed view opened, already prepared (2 runs) | — | 24–41 ms |
| Composed view closed (2 runs) | — | 172–179 ms (160 ms is `DeviceContent`'s deliberate hand-off delay) |

So the browser is not the slow part. What is left of a swipe is the worker's own cycle
(up to 125 ms at 8 fps, because a held page waited out a whole cycle before it looked
again — fixed in the same pull request as this correction by polling a held page every
20 ms) and the board: a full changed frame costs ~0.15 s to inflate and ~0.37 s to draw,
and a production patch of 432×336 was acknowledged in 387–434 ms.

Identical panels: several installations share one panel model, the same display
properties and the same view list. Each runs its own worker and browser, so the same
view is built, captured and encoded once per panel, and a shared camera snapshot is
fetched and encoded once per panel.

## The keying rule

A cached frame is keyed by **everything that changes its pixels and nothing else**:
the panel profile (size, shape, color, rotation, contrast, dithering and other display
properties), the view definition, the bound channel data and status, the time state of
time-driven panels, and the device ID **only** when the view resolves device-scoped
content (a device-context target, a per-device player or reader). Two panels with the
same key share one render and one buffer. Everything is held in memory, bounded, and
never written to disk.

## Phases

1. **Key-addressed frame store.** Generalize the request-display cache (#298) from
   one entry per device to entries per key with a device → key index, so identical
   keys share one render and one buffer. Apply the same store to update-display pushes
   so a burst of identical renders in one second renders once.
2. **Pre-rendered stream frames — DEFERRED (2026-10-23).** The measurement above shows it
   would save 30–60 ms on a native swipe, for a Chromium that never closes and a render
   of every clock view each minute. It was built (server capture in the worker's context,
   key-addressed store, a `/d/<id>/stream-frame/<view>` route, worker send at release)
   and set aside unmerged. Revisit only if a view is found whose build is slow on the
   panel's own browser. The original plan: The server renders the panel-ready frame (the exact
   payload the worker sends, plus its touch targets) for each key reachable from an
   image-stream panel's assigned views, and refreshes it when the key changes. At a
   swipe release the worker sends the destination's cached frame at once, then lets its
   live capture replace it only if the pixels differ.
   - Now Playing changes continuously while music plays. The key covers the track,
     artwork, state and controls, not the progress position; a cached frame may show a
     progress bar a few seconds old for the ~1 s until the live frame replaces it.
   - Pixel parity: the pre-render must use the same browser build, flags and fonts as
     the worker, or every swipe sends a second, nearly identical frame.
3. **Shared camera frames.** A camera view on several panels is fetched, scaled and
   encoded once per panel profile and sent to every panel showing it, without a browser
   capture per panel. The board's inflate + draw (~0.5 s per full frame) then limits the
   frame rate, which phase 4 addresses.
4. **Panel firmware — the main remaining cost of a swipe.** (a) Measure and shorten the board's inflate and draw path
   (partial regions, faster copy) — this is the camera frame rate. (b) Frame slots in
   PSRAM: the worker preloads the destination frame of each swipe direction, and the
   board swaps locally on the gesture with no network round trip. Requires OTA of each
   panel; the worker is paused first.
   Study and proposal (measured, prototyped, not flashed):
   [`2026-10-23-presto-firmware-frame-path-study.md`](2026-10-23-presto-firmware-frame-path-study.md).
   Inflate is ~4% of a full frame; the rest is PSRAM copies, pauses and the swap.
   Decoding straight into the back buffer with a lazy second-buffer sync is expected to
   take a full frame from ~0.53 s to ~0.2 s with no wire-format change.

## Verification for each phase

Measure on a real panel, not only in tests: swipe release to first changed-frame
acknowledgement, camera frames per second, worker and server CPU, and container memory
over time. Record numbers in the phase's pull request.
