# Remote browser display client

The remote-display renderer runs Chromium for a constrained ESPHome display. The application owns its UI and serves a JSON manifest. CastKit reads the manifest, pre-renders its cache URLs, sends compressed RGB565 frames, and returns physical touches to the same browser session. It does not fetch application data or issue application commands itself.

A receiver can also be a normal Slatecast device. Register it as a 480×320
browser device, then point the worker at `/d/<device-id>/castkit.json`. CastKit
generates that manifest from the registry and renders `/d/<device-id>`, so the
display receives the standard View select, Now Playing controls, Calendar view,
weather, agenda, and Home Assistant automation policy. Deployment-configured
`externalViews` appear in the same View select and fill the panel through the
Slatecast client.

This is a renderer worker under `device-client/remote-display`, packaged separately to isolate Python/Chromium dependencies from the CastKit server. It exposes no public HTTP API and no command surface. Its one optional listener is the read-only Home Assistant preview below, which is off unless `preview_port` is set. It can load either an application's manifest directly or the manifest of a browser device in CastKit's central registry. Existing Inkcast and direct-browser Slatecast clients retain their current paths.

## Application manifest, version 1

```json
{
  "version": 1,
  "viewport": { "width": 480, "height": 320 },
  "page_url": "/panel",
  "ready_selector": "[data-display-ready]",
  "input": {
    "target_attribute": "data-castkit-target",
    "max_frame_age_ms": 7000
  },
  "cache": [
    {
      "id": "loading",
      "url": "/panel/loading",
      "on_tap": "[data-loading]"
    }
  ],
  "refresh": { "max_fps": 10, "heartbeat_ms": 2000 }
}
```

URLs resolve relative to the manifest and must remain on its origin. `ready_selector` optionally waits for the application shell. Every actionable element needs a unique, stable value for the named `data-*` attribute. Include object/job identity in destructive controls so a new object at the same coordinates cannot inherit a stale tap. Disabled controls must use native `disabled` or `aria-disabled="true"`. The cache's `on_tap` CSS selector identifies actionable elements that should show the cached bitmap on a completed tap. It must be a subset of the elements with the target attribute.

Version 1 requires the WT32's 480×320 viewport and supports **zero or one** full-frame optimistic cache entry. Extra entries and incompatible versions fail explicitly. The array leaves room for receivers with more cache slots later; this receiver does not silently discard requested entries. Cache pages may contain any application-owned image or HTML UI. They load once at worker startup, after fonts and initial network activity settle. Restart the worker after changing the manifest or cache page. Actual application pages remain live; identical frames are skipped except after touches and for the heartbeat.

`max_fps` bounds capture at 1–20; it is not a promised network frame rate. `heartbeat_ms` must be 500–3000. Frame age must be 500–7000ms. The receiver disables touches after seven seconds without a displayed frame and adds a red border. Recovery replaces the stale image and restores input. The contact circle is drawn on the panel immediately. The skeleton only acknowledges navigation, never successful execution of an application command.

## Home Assistant preview

Home Assistant shows the picture for image-mode ePaper panels because CastKit
publishes PNG bytes to `<base>/image`. A browser-mode display has no such entity
and must not get one: this receiver runs at `max_fps: 10` with a 2000 ms
heartbeat, so an MQTT `image` entity would write between 43,200 and 864,000
recorder rows a day, against a measured 98 for an ePaper panel.

Set `preview_port` in the infrastructure configuration and the worker serves the
frame it already captured:

| Route | Returns |
| --- | --- |
| `GET /screen.jpg` | The newest frame, as JPEG. |
| `GET /screen.mjpeg` | `multipart/x-mixed-replace; boundary=castkitframe`, one part per changed frame, with a five-second keepalive resend. |
| `GET /healthz` | `build`, `viewers`, `frames`, `frameAgeSeconds`, `captureAgeSeconds`. |

The preview takes no screenshot of its own and encodes no JPEG until a client
asks, so a worker nobody is watching does no extra work. Identical frames do not
wake a viewer.

Add it to Home Assistant as an **MJPEG IP Camera** (Settings → Devices &
services → Add integration → MJPEG IP Camera), with `/screen.mjpeg` as the MJPEG
URL and `/screen.jpg` as the still image URL. A camera entity's state is `idle`
and never changes per frame, so the recorder writes nothing at any frame rate,
and Home Assistant opens the stream when a viewer watches and closes it when the
last viewer leaves.

⚠️ **The routes are unauthenticated.** Keep the port on a trusted network. Home
Assistant's MJPEG integration accepts basic authentication if you put a
reverse proxy in front of it.

⚠️ **Do not use the MQTT camera platform instead.** It pushes every frame onto a
topic and has the same traffic cost as the image entity.

## Install

1. Install ESPHome 2026.8.2 or later. Copy `device-client/esphome/wt32-sc01-plus.yaml` and `components/castkit_display/` into its configuration directory. Set the device name and supply the referenced keys through `secrets.yaml`. Compile and flash the display. The profile is for a WT32-SC01 Plus with 16MB flash and 2MB **quad** PSRAM.
2. Copy `device-client/remote-display/config.example.yaml` to a private configuration path. Set `manifest_url`, device host, expected MAC address, and the read-only secrets file path. No cache policy or application data goes in this infrastructure file.
3. Run `ghcr.io/sawtaytoes/castkit-remote-display:latest` with that configuration mounted at `/config/display.yaml` and the existing ESPHome secrets file at its configured path. The image runs as UID 10001. Give it read access to those mounts and outbound access to the application and encrypted ESPHome API on port 6053. No inbound port is needed.

The worker validates device identity before transferring images. API messages use 12,000-character base64 chunks and one acknowledged frame at a time. RGB565 zlib frames use format 2; cache uploads use format 3. The firmware decodes on a worker task, draws on the main loop, and keeps the loading bitmap in PSRAM. Cache contents are volatile and are sent again after reconnect. A disconnected renderer never dispatches a retained release event as a new tap.

The example firmware exposes its monochromatic backlight as an ESPHome light.
For a registered receiver, set `hasMqttBacklight: false` in the CastKit device
entry. Home Assistant can then apply the same room-light policy as other
CastKit displays without creating a duplicate MQTT backlight entity.

The firmware's `restore_mode: ALWAYS_ON` brings the panel back at full
brightness after every reboot, and an ON/OFF automation never sets a level. A
receiver whose backlight **does** listen on the CastKit MQTT light topics
(`hasMqttBacklight: true`) gets its level from CastKit instead: the server keeps
a per-device **Display: Backlight level** (0–100 %), applies it through
`backlight/brightness/set`, and sends it again each time the receiver's
`backlight/available` returns to `online`. Leave it at the default 100 % to
keep today's behaviour; see
[the decision](decisions/2026-09-11-castkit-owns-the-backlight-level-and-restores-it-on-reconnect.md).

Source run and tests:

```sh
pip install -r device-client/remote-display/requirements.txt
python -m playwright install chromium
python device-client/remote-display/worker.py --config /path/to/display.yaml
python -m unittest discover -s device-client/remote-display -p 'test_*.py'
```

`CASTKIT_TEST_CHROMIUM` selects an existing Chromium for local tests only. The infrastructure config optionally accepts `chromium` for a source run; the container uses its pinned Playwright browser.
