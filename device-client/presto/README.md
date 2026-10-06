# Pimoroni Presto receiver

Presto runs a small MicroPython receiver; the CastKit remote-display worker runs
the browser. The unit shows existing CastKit views at **480×480**, sends taps and
swipe contacts back to that same browser, and needs only USB power after
provisioning. It does not run Linux, JavaScript, Chromium or ESPHome.

## Install one unit

1. Install Pimoroni's [Presto MicroPython firmware](https://github.com/pimoroni/presto/releases).
   The regular UF2 preserves the filesystem. Back up the existing `main.py` and
   `secrets.py` before replacing them; the `with-filesystem` UF2 erases user files.
2. Connect with `mpremote`, record `machine.unique_id()` and the Wi-Fi MAC from
   `network.WLAN().config("mac")`, and register the unit in CastKit with its real
   MAC, 480×480, square, full color and touch. The remote worker uses the browser
   device registry because it renders the standard `/d/<id>` client. Set repaint
   to `fast` so views respect the transport's actual refresh budget. Enable the
   view drawer if wanted. Do not advertise an MQTT backlight until the firmware
   supports it.
3. Copy `secrets.example.py` to a private `secrets.py`; configure Wi-Fi, the relay
   host/port and a dedicated random token of at least 32 characters. Upload that
   file and `main.py` to the board root, then reset it. `main.py` starts at boot.
4. Run the existing `castkit-remote-display` image with `relay.example.yaml` as
   `/config/display.yaml`. Mount a private YAML containing `presto_token` at the
   configured `secrets_path`. Its value must match the board's `CASTKIT_TOKEN`.
   The manifest URL must identify this unit. The container runs as UID 10001;
   its configuration and secret mounts must be readable by that UID.
5. Select Touch Test and confirm every corner and the center **on the glass**.
   A server screenshot cannot prove the physical panel or touch coordinates.
   Reset the board and restart the worker; check that frames resume each time.

## Transport and measurements

The relay binds `listen_port` on a trusted private LAN. The current board client
uses plain HTTP; keep this listener private. The dedicated bearer token and MAC
binding authorize only this unit's frame/touch exchange, never CastKit management.
The worker's connection to CastKit can use HTTPS and optional read-only browser
storage state. Source-service and management credentials never reach the board.

`GET /frame?after=<id>` returns a complete zlib-compressed **little-endian RGB565**
frame (`application/vnd.castkit.rgb565+zlib`), or 204 while unchanged. The decoded
size must be exactly 460,800 bytes. MicroPython inflates directly into PicoGraphics'
back buffer, then calls `update()` once; frames are never written to flash.
`POST /ack` confirms that decode and drawing finished. `POST /touch` sends bounded
batches of sequence/phase/X/Y/displayed-frame-id samples. Every call carries the
dedicated token, MAC and a new identity for each board boot.

The worker guards contacts against the **acknowledged** image: a stale frame
cannot activate a replacement control at the same coordinates. Input is disabled
after seven seconds without a fresh frame; after fifteen seconds the panel shows
a connection notice. Wi-Fi and server failures retry, and a board reboot resets
the touch sequence. The transport caps capture at two frames per second; this is
a ceiling, not a guaranteed end-to-end frame rate. Heartbeats redraw unchanged
frames every two seconds to keep freshness meaningful.

The first full-resolution test measured approximately **500 ms PNG decode**. The
native-pixel path reduced that to **260–275 ms inflate plus 24 ms buffer update**.
Network, browser capture and polling add latency. This receiver is suitable for
information panels and deliberate taps; smooth animation and video need a more
capable client or further optimization. These measurements are from one unit,
not a promise for every Wi-Fi network or view.

Unauthenticated `/healthz` exposes build markers, last-seen age, frame and touch
counts, and the latest decode/draw timings. Optional `preview_port` serves the
existing read-only JPEG/MJPEG preview; leave it off unless needed.

## ESPHome alternative

ESPHome's [RP2 platform](https://esphome.io/components/rp2/) supports RP2350 boards,
including Pico 2 W. Its stock [MIPI RGB display driver](https://esphome.io/components/display/mipi_rgb/)
requires ESP32/ESP-IDF, so it is not a drop-in Presto driver. An ESPHome experiment
would need Presto's RGB/PIO scanout, PSRAM and CYW43439 wiring plus touch support.
MicroPython remains the tested receiver; ESPHome on this board has not been flashed
or verified.
