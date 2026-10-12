# The Music Player view reads Music Assistant directly

Status: Accepted
Date: 2026-10-12
Type: Architecture
Supersedes: None
Superseded by: None

## Decision

CastKit has a **Music Assistant** source that holds its own WebSocket to the Music Assistant server, and a **Music Player** view on a new `music-player.v1` contract. The view is a compact controller for a small desk display: the player and the queue side by side by default, a wide-waveform face as the alternative, and synced lyrics as a tab. Both layouts stay; the view's **Layout** setting picks one.

The queue shows a few played rows, the current row, and only as many upcoming rows as fit whole — it never scrolls. Controls are sized for a mouse, not a finger. There is no autoplay switch on the queue face. Lyrics seek on a click only when Music Assistant supplied time stamps.

Speaker sync is in the view: a player menu adds and removes members where Music Assistant allows it, and shows a fixed sync group read-only.

## Context

The Music Assistant web interface is built for a phone or a full-size window. On a 1024 x 600 display its transport is so large that the queue shows almost nothing. Its own Desktop Companion wraps the same web interface, so it inherits the same layout.

The existing `now-playing` and `queue` views read a Home Assistant media player over MQTT. That path has no waveform, no lyrics, no queue item ids to play from, and no group membership. [Named channels and extensions](2026-09-25-named-channels-and-extensions-drive-reusable-views.md) already allows a direct API source beside the MQTT producers, which is what lets this source exist without reopening [the pure-MQTT command path](2026-07-07-slatecast-pure-mqtt-command-path.md).

## Why

A direct source gets every field the view needs from one connection, and the token never leaves the server. Fitting rows instead of scrolling keeps the list readable at a glance from a desk chair. Keeping both layouts costs one setting and lets the owner choose per display.

## Evidence

Owner, T3 Code, 2026-10-11 (chat UUID unavailable):

> Can we not have the playlist view side-by-side with the player view? I don't need buttons spaced so far apart so giantic.

> I do like how the queue shows previous values and what's playing new as well as what's next. I don't necessarily need the ability to disable autoplay, but it's fine to have; although, does it make sense to put on the playlist view at this size? Probably not.

> It'd be a view that displays the lyrics if they exist with the right timing matched to the song and the ability to click and seek *if* that's all there.

On the three mockups (side by side, wide waveform, lyrics):

> A/C are good. B is also an option. It really depends. I like both. Let's keep them. I'll use A for now and test it out.

- Source: `packages/server/src/platform/sources/musicAssistant.ts`, covered by `musicAssistant.test.ts` against an in-memory fake server.
- View: `packages/slatecast/src/views/MusicPlayer.tsx`, covered by `MusicPlayer.test.tsx` and `musicPlayerModel.test.ts`.
- Reference: [Music Player view](../music-player-view.md).
