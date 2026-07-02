# View switching is driven by HA automations; no server-side idle fallback

- **Status:** Accepted
- **Date:** 2026-07-02
- **Type:** Product behavior / Architecture
- **Supersedes:** [2026-07-02-now-playing-idle-fallback.md](2026-07-02-now-playing-idle-fallback.md)
- **Superseded by:** —

## Decision

The server renders exactly the SELECTED view — there is no idle view, no
idle timer, no fallback logic. Home Assistant automations drive each panel's
View select, switching **immediately** on state changes. To make those
automations trivial, the server publishes one signal on the "Inkcast Server"
device: the **"Music playing"** binary sensor (retained
`inkcast/now_playing_active`, ON when the followed player is actually
playing, with the exclusion list already applied). Intended automations:
music playing → now-playing view, else clock (small panel); Family Room
Theater Plex playing → now-playing, else photo frame (large panel).

## Context

The earlier same-day decision added a server-side idle fallback with a
5-minute timeout and per-device idle view/minutes entities. In practice the
timeout meant the panel sat on a dead "now playing" card after music
stopped instead of switching instantly, and the extra knobs existed only to
configure machinery the maintainer never asked for.

## Why

Immediate switching, one obvious control surface (the View select), and all
policy in HA where it's automatable and visible.

## Evidence

> "I was playing music, then I stopped. Now, it should be in the idle
> state. I don't wanna even wait 1 min. Do it immediately like it was doing
> before. I'm thinking of removing this idle and idle timer. I only said
> that stuff because you added it. Just remove it. Instead, do _all_ of
> that from automations."

— maintainer, chat `4cb59eb7-5aea-4f0e-8404-f49dcd7a16e3` (2026-07-02)
