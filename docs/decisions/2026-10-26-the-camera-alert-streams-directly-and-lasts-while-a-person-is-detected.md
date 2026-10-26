# The camera alert streams directly and lasts while a person is detected

- **Status:** Accepted
- **Date:** 2026-10-26
- **Type:** Performance and behavior
- **Supersedes:** None (builds phase 3 of [the shared frame cache plan](../2026-10-23-shared-frame-cache-plan.md))
- **Superseded by:** None

## Decision

On image-stream panels, a camera alert does not go through a browser capture or a render
engine. The server reads the camera's Home Assistant low-latency HLS stream part by part,
decodes it once per camera with ffmpeg at 10 pictures per second and at most 480 px,
composes each panel profile's frame once (camera picture, label band or overlay, live or
snapshot state, receipt time), and encodes the changed rectangle once as the zlib patch the
panel already accepts. Every worker reads the newest frame through a long-poll on
`/media/<channel>/<camera>?kind=frames` and sends it as fast as the board acknowledges.
The newest frame always wins; nothing queues. Decoding runs only while a panel reads, and
stops 15 s after the last read.

How long the alert lasts belongs to the automation that raises it, not to CastKit: the
installation shows the camera while a person is detected, clears the override a short
grace after detection ends, and caps every alert with one hard maximum. CastKit's
existing `override/set` and `override/clear` commands carry that policy unchanged.

## Context

The owner, on 2026-10-26: *"The display of someone coming to the house via that camera
doesn't need cached because it's situational. That's one we can stream on-the-fly as
quickly as possible. I don't even think it needs Chrome or Satori. It just needs to show
the porch until person detection is over and revert back after X seconds in case it
doesn't."*

Before this change, each image-stream worker captured the alert page in its own Chromium
every time the page's snapshot image changed (one per second), so the panel showed about
one picture per second, each worker paid for its own capture and diff, and a fixed 30 s
override ended the alert whether or not someone was still at the door.

## Why

- **One decode for every panel.** The camera is the same picture on every panel; decoding
  and composing it once per profile (480x480 and 480x320 today) makes the server cost
  independent of the panel count.
- **Low-latency parts, not plain HLS.** Home Assistant's segments run 7–10 s, so a plain
  HLS reader starts many seconds behind. Reading the ~1 s parts with blocking playlist
  reloads, starting at the newest independent part, keeps the picture within about 1–2 s
  of the camera. A pacer spreads each part's burst of pictures over the second it covers
  and drops anything already late, so a slow part skips forward instead of replaying.
- **The page still owns the interaction.** The worker switches to server frames only
  when the alert page names them, so touch targets, swipes, and the dismiss path are the
  page's as before; a stale feed or a touch returns the panel to page capture.
- **The board's own patch format.** The frame is the same big-endian RGB565 zlib patch a
  capture would produce, so this needs no firmware. The 480x480 layout keeps the 4:3
  picture whole with a label band above it, which means each new picture redraws only the
  camera rectangle.
- **Duration is an installation policy.** Which sensor means "a person is here", how long
  a grace to allow, and the hard maximum differ per installation, and the automation
  already decides when the alert starts.

## Evidence

- Owner quote above (CastKit camera alert chat, 2026-10-26).
- Tests: `packages/server/src/camera/*.test.ts` (a synthetic ffmpeg test pattern, never a
  camera frame), `packages/server/src/platform/sources/homeAssistantVideo.test.ts`,
  `device-client/remote-display/test_camera_frames.py`, and `test_camera_session.py`.
