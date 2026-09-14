# A browser display's live view reaches Home Assistant as a pull camera, never an MQTT image

- **Status:** Accepted
- **Date:** 2026-09-13
- **Type:** Home Assistant / Delivery
- **Supersedes:** — it extends, and does not change, the MQTT image entity that image-mode panels get from [`discovery.ts`](../../packages/server/src/homeAssistant/discovery.ts)
- **Superseded by:** —

## Decision

**An image-mode panel keeps its MQTT `image` entity. A browser-mode display
never gets one.** A browser display's live view is served over HTTP and consumed
by Home Assistant as a **camera**, which pulls on demand.

The remote-display worker gains an opt-in preview server, disabled unless
`preview_port` is set in its infrastructure configuration:

| Route | Purpose |
| --- | --- |
| `GET /screen.jpg` | The newest captured frame, as JPEG. The camera's still image. |
| `GET /screen.mjpeg` | `multipart/x-mixed-replace`, one part per changed frame. The camera's stream. |
| `GET /healthz` | Build marker, viewer count, frame count, frame age, capture age. |

Three rules hold it in place:

1. **The preview never captures.** It reads the PNG the render loop already
   takes to drive the glass. It adds no screenshot and no render.
2. **No viewer means no work.** JPEG encoding happens inside a request handler.
   A worker nobody is watching encodes nothing.
3. **An identical frame does not wake a viewer.** `set_frame` compares bytes, so
   a static panel parks its viewers on a five-second keepalive instead of
   re-encoding the same picture ten times a second.

**MQTT stays the control contract.** The preview carries pixels only. It reads
no state, accepts no command, and publishes nothing. Home Assistant still
switches views over MQTT and still learns nothing about the panel from this.

## Context

Home Assistant shows the picture for every image-mode ePaper panel, because
CastKit publishes PNG bytes to `<base>/image` and the MQTT Image platform
renders them. Browser-mode displays have no such entity, so Home Assistant shows
nothing for them, and the owner asked for the same view of the WT32 panel.

The WT32 is the case where it is possible today. Its frames exist already: the
remote-display worker runs Chromium and calls `page.screenshot(type='png')`
every cycle to feed the ESPHome receiver. The other two browser displays render
in Chromium on the Pi itself, so no server-side frame exists for them at all.

## Why

**The rate rules out an image entity.** The live manifest sets `max_fps: 10` and
`heartbeat_ms: 2000`. That is 43,200 frames per day at rest and up to 864,000
when the view moves. Home Assistant's MQTT Image platform sets the entity state
to the timestamp of each frame, and the recorder writes a row per state change.
Measured on 2026-09-13, an image-mode panel
(`image.living_room_mantle_epaper_display`) changed state **98 times in 24
hours**. An `image` entity for the WT32 would be 400 to 8,800 times that load,
from one device, continuously. The MQTT `camera` platform fails the same way —
it also pushes every frame onto a topic.

**A camera entity is free to run.** Its state is `idle` and does not change per
frame, so the recorder writes nothing whatever the frame rate. Home Assistant
polls the still image while a card is on an open dashboard, and it opens the
MJPEG connection when a viewer watches and closes it when the last viewer
leaves. The "close the connection when nobody is looking" behaviour the owner
asked for is the camera domain's own behaviour and does not have to be built.

**MJPEG, not RTSP.** RTSP needs an H.264 encoder and an RTSP server added to a
worker that has neither, and Home Assistant plays an RTSP source through HLS,
normally 2 to 10 seconds behind. A panel the owner wants to read *now* must not
lag. MJPEG re-uses the PNG already in hand, costs one existing dependency
(Pillow) plus `aiohttp`, and lags by about one frame. go2rtc is bundled in Home
Assistant and accepts an MJPEG source, so WebRTC stays available later without
changing this.

**Accepted limitation: the preview is unauthenticated.** It is off by default and
is meant for a trusted LAN. Do not expose the port to the internet. Home
Assistant's MJPEG integration supports basic authentication, so credentials can
be added later without changing the transport.

## Evidence

The owner, 2026-09-13, on the browser-mode displays:

> "I'd like a way to display an image of what's on CastKit's browser view when
> loading the Home Assistant dashboard … instead of making it an image (since
> it's updating a lot), we could send it as a video stream. … We can close the
> connection once Home Assistant is off that view, or we'd be using too much
> memory."

And on the cost:

> "when you're sending images to Home Assistant over MQTT, does that slow it
> down or anything? … I'd like to avoid overloading Home Assistant with too much
> data if it's unnecessary. But if we're in the process of looking at the screen,
> then I'd obviously like to see what's on there at any given moment."

He chose the MJPEG camera for the WT32 first, ahead of a Home Assistant Webpage
card and ahead of design-only, in the same conversation.
