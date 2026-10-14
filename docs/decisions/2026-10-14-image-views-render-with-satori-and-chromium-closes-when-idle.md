# Image views render with Satori, and Chromium closes when idle

- **Status:** Accepted
- **Date:** 2026-10-14
- **Type:** technical
- **Supersedes:** [Views may use CSS grid, and Satori is kept current](2026-10-13-views-may-use-css-grid-and-satori-is-current.md) — item 4 only, "Chromium stays the production engine"
- **Superseded by:** —

## Decision

1. `INKCAST_RENDER_ENGINE` defaults to `satori`, and production runs it. The image views
   (`renderDevice`: the Inky panels and the M5Paper) render with Satori inside the server
   process.
2. Chromium is launched only to capture a platform page (`renderPage`, today the Watchy
   image page) and is closed after two minutes with no capture
   (`createIdleClosingBrowser`). Concurrent captures share one launch.
3. `chromium` stays available and keeps the old behavior: one long-lived browser renders
   both.
4. A view must look right in Satori. Check a changed view with `pnpm bakeoff:views` and
   `pnpm bakeoff:views:compare` against Chromium; `vrt` still captures Storybook in
   Chromium and does not show Satori's output.

## Context

Measured with `pnpm bakeoff:server-memory` after the typed-array dither (#268), all views on
the four production image sizes, 120 renders:

| Engine | Idle | Peak | Time |
| --- | ---: | ---: | ---: |
| Chromium | 231 MiB (6 processes) | 526 MiB | 76.7 s |
| Satori | 136 MiB (1 process) | 475 MiB | 57.5 s |

Satori 0.56.1 (patched to round the baseline like Chromium, #264) renders all 40 cases with
a median 1.0% of pixels differing from Chromium. The server currently captures each Watchy
page about once a minute, so the browser will rarely reach its idle close until that
schedule changes.

## Why

Satori is about 25% faster and needs no resident browser. The owner chose to close
Chromium when idle rather than keep it open for the Watchy pages.

## Evidence

Owner, T3 Code, 2026-10-13, on the Satori 0.56.1 results:

> I think we go with this version for Chrome sharing. I think it's the way to go. It's
> consistently faster and produces nearly identical outputs.

> I mean, this seems like a great idea, but I wanna figure out the RAM situation too.

Answer to "Should the image panels (Inky and M5Paper) render with Satori now?", 2026-10-14:
"Satori, and close Chromium".
