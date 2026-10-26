# A swipe destination is drawn ahead and held on the panel

- **Status:** Accepted
- **Date:** 2026-10-26
- **Type:** Performance and architecture
- **Supersedes:** None (un-defers phase 2 of [the shared frame cache plan](../2026-10-23-shared-frame-cache-plan.md))
- **Superseded by:** None

## Decision

The server draws every destination an image-stream panel can reach in one or two swipes,
in the worker's own browser context, and keeps the frames in memory keyed by what changes
their pixels. It draws only for panels whose worker is listening, and only when a key
changes. The worker keeps those frames in the panel's frame slots at the lowest priority
and shows the destination at swipe release with `show_slot`. A slot is shown only after
the board confirmed it at the current key; anything else falls back to sending the frame
drawn ahead, then the live capture. Firmware without slots gets the frame drawn ahead as
a live frame.

## Context

Phase 2 was deferred on 2026-10-23: sent as a live frame, a frame drawn ahead saved
30–60 ms of a ~700 ms swipe, because the board's transfer and draw of a full frame
dominated. Panel firmware with frame slots (`Sawtaytoes/esphome-presto` #3) shows a held
frame with a pointer swap at the next vertical blank, so the frame drawn ahead is now
the whole swipe.

## Why

A swipe that waits for the panel's browser to build the view, a capture, and a full-frame
transfer shows the "Release for …" hint and then a late picture. A frame already on the
board removes all three from the swipe. Keying by pixels shares the work between
identical panels, rendering only on a key change keeps the server idle when nothing
changes, and memory-only storage keeps the frames off the SSDs.

## Evidence

Owner: swipes are "still super laggy" (measured 670–740 ms touch to acknowledgement);
every swipe destination should be pre-rendered and cached so a swipe never shows a
loading state, deduplicated across identical panels, in memory only, with no idle CPU
burn and no leaks.

Source: T3 Code CastKit instant-swipe conversation, 2026-10-26.
