# A Watchy image renders only when the watch asks

- **Status:** Accepted
- **Date:** 2026-10-14
- **Type:** Owner decision / rendering and resource use
- **Supersedes:** —
- **Superseded by:** —

## Decision

1. An image device carries an optional `renderOn` field: `"update"` (the default, and
   every existing device) or `"request"`.
2. A `renderOn: "request"` device is rendered only when something asks for its frame:
   - the device's own `<base>/<id>/refresh/set` (the Watchy publishes `PRESS` there
     when the Points page wakes; Home Assistant's Refresh button uses the same topic),
   - `POST /api/devices/:id/refresh` (the manual refresh),
   - a view select (`setView`).
3. Everything else skips it before any render: the minute clock tick, the Home
   Assistant data topics, the platform image scheduler, setting changes, a removed
   platform target, and the boot push. The platform image scheduler does not even
   offer it frames. `pushDevice` does the refusal for every other path, so a new
   background caller is covered without knowing about the field.
4. Both Watchy installations get `renderOn: "request"`. **The M5Paper does not.** Its
   firmware never publishes `refresh/set`; it stays connected and waits for the
   `image_url` the server pushes, so on-request rendering would freeze it.
5. The paused switch still wins: a paused display stays paused when it asks.

## Context

The two Watchy installations (200 x 200 monochrome, `imageDelivery: http-pull`, on
battery) have a platform screen assigned and sit on the clock-bearing
`Now Playing (Dashboard)` view. The minute clock tick (`startClockTicker` in
`packages/server/src/index.ts`) pushed both every minute, and with a platform screen
assigned each push captured the page through `renderPage` in Chromium. The bytes almost
never changed, so the log showed `push watchy-…` followed by
`skip watchy-… image_url (unchanged render)` once a minute per watch, all day.

After image views moved to Satori, `renderPage` is the only Chromium user and the
browser closes after two idle minutes (see
[the Satori decision](2026-10-14-image-views-render-with-satori-and-chromium-closes-when-idle.md)).
The Watchy captures alone kept it open permanently.

The watch already asks for a fresh image whenever it needs one: `refresh_castkit` in
`device-client/esphome/watchy-v3.yaml` publishes `refresh/set` one second after the
MQTT connection while the Points page is shown, and again every 30 seconds while the
page has no image. `image_url` was already non-retained, so a frame pushed while the
watch slept was lost anyway.

## Why

A frame rendered for a sleeping watch reaches nobody. Rendering on the request costs
one capture per Points wake, and lets Chromium close between requests. The watch keeps
its sleep deadline open for at least 15 seconds after it connects, and a cold Chromium
launch plus a capture takes a few seconds, so the request is answered inside that window.

A per-device field, rather than "every `http-pull` display", keeps the M5Paper correct:
`http-pull` describes how the bytes travel, not whether the client asks on wake.

**Consequence accepted with the decision:** a watch on USB that stays connected on the
Points page no longer receives a new image when the points change; it gets one the next
time it requests (opening the page again, or its next battery wake).

## Evidence

Owner, T3 Code conversation, 2026-10-14 (chat ID unavailable). Question: "The server
renders both Watchy images every minute, even when nobody has the Points page open.
Should the server render a Watchy image only when the watch asks for one?" Answer:

> Only on request — The watch already asks for a fresh image when the Points page wakes.
> The server stops the every-minute renders for http-pull displays, so Chromium can close
> between requests.

Production log before the change: `push watchy-<id> (Now Playing (Dashboard), … bytes)`
and `skip watchy-<id> image_url (unchanged render)` at second :00 of every minute for both
watches. Unit tests in `packages/server/src/pushController.test.ts` cover the refusal,
the requested render, the view select, the pause switch, and unchanged defaults.
