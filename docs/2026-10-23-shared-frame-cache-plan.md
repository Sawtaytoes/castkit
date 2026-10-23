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
2. **Pre-rendered stream frames.** The server renders the panel-ready frame (the exact
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
4. **Panel firmware.** (a) Measure and shorten the board's inflate and draw path
   (partial regions, faster copy) — this is the camera frame rate. (b) Frame slots in
   PSRAM: the worker preloads the destination frame of each swipe direction, and the
   board swaps locally on the gesture with no network round trip. Requires OTA of each
   panel; the worker is paused first.

## Verification for each phase

Measure on a real panel, not only in tests: swipe release to first changed-frame
acknowledgement, camera frames per second, worker and server CPU, and container memory
over time. Record numbers in the phase's pull request.
