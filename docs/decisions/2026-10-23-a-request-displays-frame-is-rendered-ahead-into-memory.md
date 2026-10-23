# A request display's frame is rendered ahead into memory

- **Status:** Accepted
- **Date:** 2026-10-23
- **Type:** Owner decision / rendering latency and resource use
- **Supersedes:** —
- **Superseded by:** —

Builds on [A Watchy image renders only when the watch asks](2026-10-14-a-watchy-image-renders-only-when-the-watch-asks.md)
and keeps its rule: nothing renders a Watchy on the clock.

## Decision

1. The server keeps the latest frame of each `renderOn: "request"` display **in memory**:
   one entry per display, a plain `Buffer` plus the key it was rendered from
   (`packages/server/src/render/requestFrameCache.ts`). **Nothing is written to disk**, and
   a restart costs one render on the first request.
2. The key is everything the frame is drawn from: the platform target and its view, the
   display properties, every bound channel's status and data, the discrete facts `now`
   decides for the view, and every render setting (margin, rotation, dither, color mode,
   brightness, saturation). Two frames with the same key are the same picture
   (`packages/server/src/platform/requestFrameKey.ts`, `readFrameKey` in
   `pushController.ts`).
3. The platform image scheduler renders the frame **ahead** when the key changes. It
   reuses the scheduler's existing one-second check, so there is **no new timer**. A
   changed key must hold for 2 seconds before it renders, and a burst of changes still
   gets a frame within 10 seconds. A display that shows its frame now (`renderOn: "update"`)
   is always pushed first. The scheduler runs one render at a time, so a capture ahead can
   hold the next platform push back by the length of one capture (about 0.2 seconds warm,
   about 1 second with a browser launch).
4. The watch's `refresh/set` (and the manual refresh and a view select) is answered from
   the buffer when its key still matches. A request that arrives while the frame for the
   same key is rendering waits for that render instead of starting a second one. A request
   whose key differs renders on the request, exactly as before, and that frame becomes
   the one kept.
5. **Time never starts a render ahead.** A view counts as time-driven, and keeps nothing,
   when it shows a running clock or timer, or binds a `time.v1` channel, or uses a panel
   the server has no time rule for. The rules written down today:
   - `kids-points`: the totals list (`isTotalsOnly`) has no time behavior. Any other
     layout is time-driven while a timer runs or a scan banner shows, because one counts
     minutes and the other expires on its own. When the banner ends the key changes, and
     the settled frame is rendered ahead.
   - `calendar` / `agenda`: the key carries how many events are still listed, so the
     frame is rendered ahead at the moment an event leaves the list (an hour after it
     starts, the rule `getUpcomingAgendaEvents` in `@castkit/sdk/agendaWindow` now holds
     for both the browser view and the server). The short landscape panel draws a clock
     face for a calendar, so it is time-driven.
   - Every other panel spec: time-driven, so it renders on the request as before. Write
     its rule into `getPanelTimeState` before it can be kept.
6. A frame is dropped when no frame can be kept for its display any more (the platform
   screen was unassigned, or the view became time-driven). A paused display renders
   nothing ahead.
7. **The Satori image views get no render cache.** The measurement is under Evidence.

## Context

Since #270 the server renders a Watchy image only when the watch asks. That render is a
Chromium page capture of the platform screen. The watch waited for the capture on every
request: about 0.7 seconds warm, and a browser launch on top of it after the idle
browser had closed, two minutes after the last capture.

The two Watchy installations show a kids-points totals list (`isTotalsOnly`) and an
agenda. Neither view shows a clock. Their content changes when the points or the agenda
payload change, which is a few times a day, not every minute.

## Why

The owner wanted the image ready before the watch asks, and kept in memory: "We can keep
those in memory. They don't have to be written to disk necessarily. Seems like a lot of
unnecessary data to keep on disk is all, and it would add a lot of unnecessary writes to
my SSDs."

A render ahead runs only when the picture changes, so Chromium still closes between
bursts, which is what #270 was for. The cost is one capture per content change per
display, against one capture per request before.

A view the server cannot model keeps the old behavior instead of guessing. A frame kept
too long is a wrong picture on a watch that will not ask again soon, so an unknown time
rule must fail toward rendering on the request.

## Evidence

Owner request, T3 Code conversation, 2026-10-23 (chat ID unavailable), relayed in the
task brief: "We can keep those in memory. They don't have to be written to disk
necessarily. Seems like a lot of unnecessary data to keep on disk is all, and it would add
a lot of unnecessary writes to my SSDs."

**Request latency, measured locally on 2026-10-23** with the built server
(`node packages/server/dist/index.js`, Satori engine, MQTT off) and a 200 x 200 monochrome
`renderOn: "request"` display on a kids-points totals view, timed with `curl` on
`POST /api/devices/<id>/refresh`:

| Path | Time |
| --- | --- |
| Request answered from the frame kept in memory (5 runs) | 1.0–2.5 ms |
| Same, after the idle browser had closed | 2.2 ms |
| Uncached capture, the old request path, warm browser (5 runs, `GET /api/devices/<id>/image`) | 187–239 ms |
| Uncached capture, cold browser launch | 1035 ms |
| The capture ahead itself, cold, at boot | 770 ms |

The local page had no channel data, so it is lighter than production's, where the owner
saw about 0.7 seconds warm. Over 130 idle seconds the server rendered nothing ahead
after the boot frame: the clock starts no render.

**Satori image views: no cache.** Production logs from 07:49 to 08:16 UTC on 2026-10-23
show the M5Paper and the Inky pHAT on `Clock (Agenda)` rendered once at second :00 of every
minute (the minute tick), plus two byte-identical extra renders at :00 and :15 (the clock
tick and two data topics landing within a second). So about 8 of every 68 renders per
display per hour repeat an input that was just rendered. A warm Satori render of
`Clock (Agenda)` measured 55 ms median on the Inky's 250 x 122 and 200 ms on the M5Paper's
960 x 540 (20 warm runs each, `createRenderService({ engineName: "satori" })`). The repeats
cost about 0.4 s and 1.6 s of CPU an hour. Nobody waits on these pushes, the M5Paper already
skips an unchanged `image_url`, and the Pi receiver (`inkcast_receiver.py`) already skips
redrawing identical bytes. Every minute changes the clock text, so a cache keyed on the
render inputs could only ever catch those repeats. It does not earn its code.
