# Every released request shows its destination until the view is built

- **Status:** Accepted
- **Date:** 2026-10-26
- **Type:** Performance and behavior
- **Supersedes:** None (completes [a swipe destination is drawn ahead and held on the panel](2026-10-26-a-swipe-destination-is-drawn-ahead-and-held-on-the-panel.md))
- **Superseded by:** None

## Decision

1. **Every contact that asks for a view releases to its destination**, whatever touch
   path it took: the stage gesture, or a native touch (a pull from the top, bottom, or
   right shell edge, a drag that began on a scroll list or the artwork). Slatecast writes
   the request to `window.__castkitNavigation` (`{id, view}`) in the same task that sends
   it, and the worker compares it with the value at the contact's start. One contact
   releases once.
2. **The destination stays on the glass until the live page has built the view**: the
   page is settled, every image on the glass has loaded, and the page has been quiet for
   0.15 s. The hold starts at the release, lasts at most 3 s, and ends at the next touch.
   A capture equal to the destination is not sent again.
3. **The left swipe's composed view (Kids Points) is not drawn ahead before the panel's
   first left swipe.** The device names a request (`leftSwipeViewId`), not a target, and
   the house answers it with a per-room view. A guessed target could show another room's
   board for a frame, which is worse than a late one.

## Context

After the frame-slot rollout every panel logged `releases_ahead=0`: the slot path was
never used. Two causes. The worker looked for a request only after the stage gesture,
and a contact that starts on a shell edge, a scroll list, or a slider stays a native
touch. And it read the request from the loading feedback in the DOM, which renders a
microtask after the request; the server, on loopback, applies a native view so fast that
its answer had usually removed the feedback before the worker looked, so even the
gesture path found nothing. Separately, the live page builds Now Playing before its
cover arrives, and that picture (an empty artwork box in the default accent) reached the
glass ahead of the finished one.

## Why

The owner sees a swipe as one motion; which element the finger landed on is not his
concern. A request read in the same task cannot race the answer. Holding the picture
drawn ahead until the page matches it means the glass goes straight from the pull to the
finished view.

## Evidence

Owner, after the slot rollout: "MUCH FASTER! The music one still needs work. Has
loading." Production: 70 touches on one panel, `last_touch_to_ack_ms` 1154.9,
`releases_ahead=0` on all four panels. Reproduced against the e2e server in the worker's
own context: a top-edge pull released nothing, a stage gesture found no request, and a
swipe to Now Playing with a slow cover sent an empty-artwork frame 0.4 s after the pull
and the finished frame 1.4 s after. With this change, every path showed its destination
0.3 s after the pull and the next live capture was identical to it.

Source: T3 Code CastKit instant-swipe follow-up, 2026-10-26.
