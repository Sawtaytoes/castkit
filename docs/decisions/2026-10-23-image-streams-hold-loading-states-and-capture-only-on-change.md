# Image streams hold loading states and capture only on change

- **Status:** Accepted
- **Date:** 2026-10-23
- **Type:** Performance and presentation
- **Supersedes:** None
- **Superseded by:** None

## Decision

A managed image-stream worker never sends a loading state to its panel. While the
device shell reports one (`data-castkit-ready="false"`, `.platform-loading`, a busy
`.platform-view`, or loading navigation feedback), the panel keeps the last complete
frame. The hold is bounded by `SETTLE_HOLD_SECONDS` (3 s): past it the current page is
sent, so a view that never settles still reaches the glass. Heartbeats during a hold
repeat the frame already shown and do not acknowledge newer touches.

A worker captures and encodes a frame only when the page reports a change, a touch is
held or forced a frame, live content (video, canvas, iframe, MJPEG image, a running
animation) is on screen, or `IDLE_CAPTURE_SECONDS` (1 s, or the heartbeat if shorter)
passed. One page evaluation per cycle makes that decision.

The kiosk's top document is kept on its origin by Chromium `Fetch` interception of
main-frame `Document` requests, not by a Playwright route over every request.

## Context

Image-stream panels showed "Loading view" skeletons and "Opening …" feedback between
views. Each frame costs the panel about 0.5 s to decode and draw, so a loading frame
also delayed the finished view that followed it. The browser-device feedback that
introduced the overlay is right for live browsers and wrong for finished images.

Every worker captured, decoded and re-encoded a 480×480 frame at its `max_fps` even
when nothing changed. Five workers used about 1.6-1.9 cores, most of it on idle panels.

A heap reading of a 23-hour-old driver found the only growth in Playwright Request,
Response and Route objects created by `page.route("**/*")`. The driver keeps 10,000 of
each before it releases the oldest, and the worker mirrors them, so view preparation's
background requests grew each driver by 100 MiB or more in a day before it levelled.

## Why

The panel should show finished views only. Holding the last complete frame is what a
person expects from a display that switches pictures, and it removes a half-second
frame from the critical path. Sampling at least once a second keeps changes the page
cannot observe (a decoded image frame) visible without paying a full capture cycle at
`max_fps` forever. Intercepting only documents keeps the origin guarantee and creates
no per-request objects.

## Evidence

Owner: "I really hate that "loading" view that shows up on ESP32 screens. It'd be best
to have them all pre-cached."

Owner, on 1.6-1.9 idle cores: "That's quite a few to always be tying up especially
since they're mostly idle."

Owner, on driver growth: "Yeah, I don't want memory leaks."

Source: T3 Code CastKit memory conversation, 2026-10-23.
