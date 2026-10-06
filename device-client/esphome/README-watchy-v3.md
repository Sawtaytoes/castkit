# Watchy v3: local clock and CastKit page

`watchy-v3.yaml` is an ESPHome package for the SQFMI Watchy v3 only: ESP32-S3,
8 MB flash, no PSRAM, and the 200 x 200 monochrome display. It uses mainline
ESPHome components plus the local Watchy battery and SSD1681 display components. Earlier revisions have different processors, pins and RTCs.

The watch keeps its clock locally, synchronized with SNTP and with Home Assistant
as a fallback over its encrypted native API. Its other page draws
the CastKit image assigned to this display. A Tally Marks source and a filtered
`kids-points.v1` channel can supply a child's total, goal, running task and scan
feedback. Configure the child filter and view in CastKit. An optional private
`timer_state_topic` substitution can point at that child's retained Tally Marks
state topic for automatic timer selection; the public package contains no child ID.
The watch never awards points or changes the ledger.

## Install

Make a private wrapper next to the package:

```yaml
substitutions:
  node_name: watchy-example
  friendly_name: Watchy Display
  device_id: watchy-example
  timezone: Europe/London
packages:
  watchy: !include watchy-v3.yaml
```

Supply `wifi_ssid`, `wifi_password`, `ap_fallback_password`,
`api_encryption_key`, `ota_password`, `mqtt_broker`, `mqtt_username`,
`mqtt_password`, and `mqtt_certificate_authority` in a gitignored
`secrets.yaml`. The MQTT CA must validate the broker's certificate, including
its hostname. HTTP images use the ESP-IDF trust bundle with verification on.
Use a unique node/device ID per physical watch. The package defaults to UTC;
the installation sets a named timezone with daylight saving rules.

Before replacing existing firmware, enter the bootloader and read the entire
8 MB flash to private storage. It may contain credentials and must not go into
Git. Check its size and hash and keep a restore copy:

```sh
esptool --chip esp32s3 --port <port> read-flash 0 0x800000 stock.bin
esphome compile watchy-example.yaml
esptool --chip esp32s3 --port <port> write-flash 0 .esphome/build/watchy-example/build/firmware.factory.bin
```

Use the factory image at offset zero for the first flash, not the OTA image.
Confirm the target's MAC before writing if several boards are connected.

With USB connected, hold Back + Up for more than four seconds. Release Back
first and Up second to enter the bootloader. After flashing, release Up first
and Back second to reset into the application. A successful flash or an
esptool reset message alone does not prove that the application started.

Register the CastKit device at its actual 200 x 200 size, `monochrome`,
rotation 0, `imageDelivery: http-pull`, `hasBattery: true`, `repaint: fast`,
and the appropriate power source. Assign a platform screen containing the
chosen view. CastKit publishes its Home Assistant MQTT discovery automatically.
The encrypted native ESPHome API can also be adopted in Home Assistant.

## Use

- Top-right (Up): open cached agenda page 1, advance through its pages, then return to the default clock. The agenda omits its heading, date and battery; larger bold times separate event rows.
- Top-left (Back): return to the default clock and synchronize immediately. A running task reopens its timer when the authoritative snapshot arrives.
- Bottom-right (Down): open optional local scores, advance their pages, then return to the default clock. On a scores-disabled watch it advances an already-open agenda.
- Bottom-left (Menu): toggle binary/digital clocks locally; hold for two seconds to synchronize and reopen a running task. Waking and already-awake presses have the same meaning.
- View buttons wake and draw cached data without enabling Wi-Fi on battery. Back and held Menu request a connection immediately.
- Native API actions: `show_clock`, `show_agenda`, `show_scores`, `show_binary_clock`, `show_castkit`, `set_image`, `cycle_agenda`, `cycle_scores`, and `toggle_clock`.
  `set_time(timestamp)` also provisions a valid Unix time when network time is unavailable.

Clock and timer labels use bold type. Local clock, timer and scores pages show
SQFMI's three battery bars in the top right, without a numeric percentage.
The thresholds are strictly above 3.2, 3.6 and 4.0 V. They are coarse voltage
levels, not a calibrated remaining-capacity or runtime estimate. Agenda has no battery.
The charging bolt remains separate from the bars and follows the active-low
GPIO10 charger status, rather than the presence of USB power. The diagnostic Device Time and IP Address entities
make synchronization and future OTA updates observable in Home Assistant.

The device subscribes to `castkit/<device_id>/image_url`. Only while the CastKit
page is selected does it request a fresh single-use PNG on
`castkit/<device_id>/refresh/set` and download image updates. Local clock, timer,
agenda, scores and binary pages need no image download or server render.
The local clock still works without CastKit.
A cold start without network time shows `Syncing time...` instead of a false date.

USB detection is GPIO21, distinct from the active-low charge-status GPIO10.
On USB the firmware stays awake for live updates and OTA, using modem power saving.
On battery it connects once each minute by default, receives its retained agenda,
configured timer and optional scores, then sleeps after one second for queued rows
and telemetry. A running timer also sleeps: its authoritative start time, name,
banked minutes and selected page are cached in RTC SRAM across sleep, so elapsed
minutes keep advancing locally between connections. A start or stop scan is noticed
on the next successful connection. A new session selects the timer; ordinary repeated
state and scheduled reconnects preserve the user's page choice. Explicit Back, held Menu or native `sync_now` reopens an active timer even when its start time is unchanged. Manual sync keeps an existing MQTT connection open and clears receipt flags so old data cannot complete the new transfer. An optional `state_refresh_topic` publishes a non-retained JSON `{requestId}` challenge after connection; its producer must reply with current state on the configured subscriptions. Without a producer refresh topic, a connected refresh waits for the next published snapshot.

Set `battery_sync_minutes: '10'` for a calendar-only watch: the clock still
wakes each minute, but Wi-Fi is enabled only on ten-minute boundaries. USB, manual
sync, cold boot or an invalid clock bypass the cadence. Between scheduled connections
it draws locally, waits for the panel to finish and a brief button interaction window, then sleeps. A timed-card watch should keep `1` for its
scan response time. Use intervals that divide 60 for evenly spaced checks.

After a failed connection, a one-minute watch retries after five minutes, then
15 minutes on further failures. Slower calendar watches retry every 15 minutes.
Successful MQTT restores the normal cadence. Manual sync bypasses backoff; view
buttons remain offline. Retry state lives in RTC SRAM without flash writes.

Wi-Fi fast-connect remembers the last AP and channel in RTC memory, avoiding a full
scan and a flash write each wake. Short battery connections disable modem sleep to
finish their exchanges promptly, while USB uses modem sleep. Hardware MPI acceleration
reduces RSA work in TLS without weakening certificate verification; large keys retain
the software fallback. MQTT waits for association and valid local time before DNS/TLS.
Automatic MQTT log forwarding is off; native and serial logs remain available.

If retained state does not arrive, the battery window permits 15 seconds, plus at
most 15 more when MQTT is still connecting. Repeated state messages cannot postpone
that deadline. Any of the four buttons wakes it. The external 32 kHz crystal keeps the
clock through deep sleep. The downloaded CastKit image is not persisted, so a wake on
that page requests a new URL; local pages exchange no images. Logs report the awake
duration at sleep entry. Connection timing is not a battery endurance measurement:
current draw and runtime still require an unplugged test.

With `timer_state_topic` configured, any new running session automatically opens
a local timer with the task name and current whole minutes. Count-up tasks show
today's total (banked minutes plus this run), with this run's elapsed minutes
alongside it; countdown tasks show minutes left. The cached session's start
time survives missed scans, deep sleep and reconnects. Ending the session returns to the clock.
The watch computes display time only, never scoring, completing or stopping a task.
Menu and Back remain available while a task is running.

Scan feedback is immediate while connected, subject to CastKit's repaint
budget. A sleeping watch cannot receive a scan: totals update on its next
successful connection and short feedback may already have expired. Battery
runtime and actual refresh latency need measurement on the physical unit.

Battery telemetry uses the v3 voltage-divider ratio and CastKit's existing `volts`, `percent`, and
`isOnBattery` fields. Percentage is an uncalibrated linear estimate. Below
3.35 V on battery the display says `Battery low / Connect USB` and sleeps for
an hour; it does not leave an apparently working frozen clock or stale points.

The CPU boots and draws at 80 MHz. A network wake holds 160 MHz through an
ESP-IDF power-management lock until Wi-Fi disconnects. The firmware uses no
accelerometer, step counter, vibration or additional watch apps, so it turns that
hardware off: each non-deep-sleep boot soft-resets the BMA423 into suspend mode
(the stock firmware leaves it at 100 Hz continuous), and GPIO17 holds the
vibration motor off through deep sleep. The diagnostic Accelerometer entity shows
the result. Clock Wake Duration and Sync Wake Duration report the average awake
time per battery wake, from application start to sleep entry; they publish on
the next connected wake.

Customize the watch face in the package's display lambda and font definitions.
Customize the data page in CastKit's view/channel editor.

## Verify and restore

Check serial or native API logs for Wi-Fi association, successful clock
synchronization, and an image download. Compare the clock and date on the
physical panel, exercise Menu and Back, and scan a real card without creating
synthetic ledger activity. Disconnect USB to verify minute wake and button wake.
Check Home Assistant's display entities and battery telemetry.

A compiled or server-rendered image is not proof of what the glass shows.
If the new firmware cannot be made functional, restore `stock.bin` at offset
zero and reset using the buttons. Later updates can use encrypted ESPHome OTA.

## Battery measurement

SQFMI's v3 library reads calibrated GPIO9 voltage and multiplies it by
`(360 + 100) / 360`. Its example face uses bars at 3.2, 3.6 and 4.0 V, not a
fuel-gauge percentage. This package keeps that hardware mapping and divider.
However, a full 4.2 V cell supplies about 3.287 V to the ADC, above the standard
ESP32-S3 range. A saturated read can otherwise appear as roughly 3.97 V and 73%.
The local `components/watchy_battery` sensor applies
[Espressif's official range-extension algorithm](https://docs.espressif.com/projects/esp-iot-solution/en/release-v2.0/others/adc_range.html)
to a second reading above 2.9 V. It restores the calibration offset before
releasing the ADC lock and leaves the shared ESP-IDF framework unchanged.
Copy that component directory beside the package when installing it; the sensor
owns ADC1 channel 8 and must not share ADC1 with another sensor.

The percentage is still an estimate from cell voltage, not a measurement of
remaining capacity. USB present, charger inactive and voltage at least 4.15 V is shown as full.
The earlier stock-face 4.0 V bar threshold was too coarse to assert 100%.
Eight ADC readings discard the highest and lowest samples; a smoothed voltage
estimate survives deep sleep in RTC SRAM. Invalid reads preserve the prior
measurement, and a true low-cell sample bypasses smoothing for safe sleep.
Home Assistant percentage telemetry remains an approximate voltage-derived estimate;
the watch face uses bars instead. Raw voltage remains available for diagnosis. While charging,
the estimate is capped at 99%; the bolt disappears when charging stops.
The low-battery guard uses the measured cell voltage, independently of the
percentage. A failed extended read is not published as a successful voltage.
References: [SQFMI battery divider](https://github.com/sqfmi/Watchy/blob/master/src/Watchy.h)
and [v3 schematic](https://github.com/sqfmi/watchy-hardware/blob/v3.0/WatchySchematic.pdf).

## Offline agenda

Publish a retained, QoS 1 snapshot on `castkit/<device_id>/agenda/set` (or override
`agenda_state_topic`). It uses the existing CastKit agenda contract with an
additional local-date envelope:

```json
{"date":"2026-10-05","events":[{"startMs":1791222000000,"endMs":1791225600000,"summary":"Practice","isAllDay":false}]}
```

An empty `events` array means a successfully synced day with no events. A producer
must fetch the full local day, include past events, sort by start and publish the
snapshot periodically, at local midnight, and after calendar changes. Do not
publish an empty replacement after a failed fetch. The watch stores one dated
snapshot in RTC SRAM; it survives deep sleep without flash writes. A cold reset
or complete power loss clears it and requires a new sync.
Yesterday's snapshot is never presented as today's agenda. Without today's data,
the agenda asks to connect to Wi-Fi. A cold start still needs valid time.

Two complete event rows fit each page; top-right reaches every stored event and returns to the clock. The
cache holds up to 32 events and shows `+ more` if a day exceeds that capacity.
Titles wrap to two lines and clip with an ellipsis. Its embedded font is ASCII;
Curly apostrophes normalize to the ASCII apostrophe and é/É to e/E;
other Unicode code points are displayed as `?`. Retained timer messages do not
change the selected page unless a new session has started.

The standalone cache test exercises malformed snapshots, timestamp bounds,
all-day ordering, title bounds, overflow reporting, identical snapshot stability,
empty days and serialization. With an ArduinoJson include directory available:

```sh
c++ -std=c++17 -I/path/to/ArduinoJson/src device-client/esphome/tests/watchy_agenda.cpp -o /tmp/watchy-agenda-test
/tmp/watchy-agenda-test
```

Compile the ESPHome wrapper to verify the full firmware and hardware component.


## Button scores and offline use

The clock is local and continues without Wi-Fi or CastKit after synchronization.
The dated agenda remains in RTC SRAM during deep sleep. A cold start after complete power loss
needs a time source again; the v3 crystal keeps time during deep sleep, rather
than supplying an independently powered RTC.

An optional local scores page shows three children per page using bold names
and totals. Enable it in the private wrapper:

```yaml
substitutions:
  scores_enabled: 'true'
  scores_state_topic: points/state/+
  scores_expected_count: '3'
  state_refresh_topic: points/cmd/health
```

The subscription reads Tally Marks' retained per-child state. Bottom-right opens scores
from the clock, binary clock, timer or CastKit page. Top-left returns to the default clock.
Top-right cycles the agenda and then returns to that clock. Bottom-right advances scores pages and returns to the default clock after the last page. `show_scores` is also
available through the encrypted native API.

The cache accepts a child's `{kid, kidName, day, pointsToday, displayOrder, ts}`
state, or a dated canonical `{date, kids: [{id, name, pointsToday, displayOrder}]}`
snapshot on the configured topic. `ts` is optional epoch milliseconds. It stores
up to six entries with bounded identities/names, orders them by the producer's
manual order, supports negative scores and retains data in RTC SRAM without NVS writes. Invalid,
older or oversized snapshots preserve the previous cache. A new day clears old
rows before collecting the new day's children.

Away from Wi-Fi, the page shows the last received scores with their date and an
`Offline / saved` label. It never labels another day's totals as today's score.
Points update only when the watch reconnects; viewing scores makes no ledger
changes. Agenda-only installations can leave scores disabled.


## Binary clock

Set `binary_clock_enabled: 'true'` in the private wrapper to use the local binary
clock as the default face. Top-left and the end of a timed session return to it. Five hour positions
represent the 12-hour value 1 through 12; six minute bits represent 0 through 59. Filled dots count
toward their labelled weights (32, 16, 8, 4, 2, 1). Add the filled weights in
each column. There is no duplicate digital time below the dots; bottom-left opens the digital clock. The redundant Binary heading is omitted. There is no seconds column, so the existing minute refresh and sleep
cadence stays in place. `show_binary_clock` is available through the native API.
This face works offline from the same local clock.

Agenda and scores normalize curly apostrophes to the embedded straight-apostrophe
glyph. Long text remains bounded; unsupported non-ASCII characters are replaced
once per code point rather than splitting UTF-8 in the cache.


## Display refresh and radio efficiency

Copy `components/watchy_display` beside the package as well. The local display
adapter uses the Watchy SSD1681 controller's temperature-based waveform and
partial-refresh sequence, with both previous and current image planes restored.
It retains the last 5,000-byte monochrome frame and cleaning counter in RTC SRAM
across deep sleep. Identical frames do not refresh. A cold reset starts with one
full refresh; subsequent changed frames use partial refreshes, with a full clean
after 29 partial updates. This prevents every minute wake from restarting the
full-refresh cycle. No flash writes are made for the framebuffer or counter.

Reference hardware protocol: [SQFMI display implementation](https://github.com/sqfmi/Watchy/blob/master/src/Display.cpp)
and [GxEPD2 SSD1681 driver](https://github.com/ZinggJM/GxEPD2/blob/master/src/epd/GxEPD2_154_D67.cpp).
The generic 1.54-inch driver previously used a different partial control byte,
lost its refresh cadence at each wake and did not restore the previous plane.

On MQTT connection the watch waits for the component's connected state, then
publishes battery telemetry during its short wake. The backend callback alone
fires too early for publication.
OTA start pauses the sleep deadline until completion or error, so an update
cannot be interrupted by the normal idle battery schedule. Full and partial
refreshes and skipped duplicate frames are observable in native/serial logs.


The Up button's RTC pull-up is explicitly enabled during shutdown, as in the
manufacturer firmware, preventing a floating low input from waking the watch
again immediately. The Wake Reason diagnostic reports timer, button or reset
(including the SDK reset reason) to make unwanted wakes observable. A sleeping
watch detects USB at its next wake.

The adapter hibernates the controller once per draw. Shutdown skips an already
hibernated panel; sending another power-off sequence to it previously waited
for a busy signal until the five-second task watchdog reset the MCU. Panel busy
waits now feed the watchdog and have a bounded error timeout.

## Optional roaming VPN

Include `watchy-v3-wireguard.yaml` after the base package. Supply substitutions
`vpn_address`, `vpn_private_key` (a per-device secret) and `vpn_home_ssid` (the
home SSID secret). Set `vpn_dns_server` to a resolver reachable through the VPN.
The package reads shared `wireguard_peer_endpoint` and `wireguard_peer_public_key` secrets.
Provision each watch as a distinct server peer; never reuse another device's key.
Configure known roaming networks in the private wrapper's `wifi.networks` list.

At home the VPN stays disabled. On another configured Wi-Fi network, the firmware
bootstraps the endpoint with public DNS, starts a full-tunnel WireGuard connection,
then selects the VPN DNS resolver after a handshake. MQTT waits up to ten seconds
for that handshake within the existing battery deadline. A missing tunnel cannot
stop the cached clock. USB keeps the tunnel alive; battery sleep shuts down the
radio and tunnel. VPN and OTA do not make an unknown Wi-Fi network usable.

## Agenda producer and storage

The agenda data path is independent of server-rendered CastKit images. Home
Assistant, a calendar bridge or another authorized producer can publish the small
retained snapshot directly on `agenda_state_topic`. The watch draws from its RTC SRAM
cache, including while paging offline; no HTTP request is needed. Producers
must retain updates because a sleeping ESP32 cannot receive a live push. It receives
the newest snapshot on the next scheduled or manual connection.

No PSRAM is required or present on this board. The local agenda holds bounded data,
not PNGs. Agenda, scores, timer and selected pages occupy under 4 KB in RTC FAST
SRAM; the previous 5,000-byte pixel frame uses RTC SLOW SRAM. Neither cache writes
flash. They survive deep sleep; a cold reset or complete power loss needs a fresh sync.
Network retry state and the safe-mode boot counter also use RTC SRAM. This battery policy is scoped to Watchy;
it does not change the connected behavior of mains-powered CastKit panels.

## Next event and responsive navigation

Both local clock faces show today's next timed event: a large bold `Next h:mma/p`
line and its title. An ongoing event shows `Now`; after timed events, an all-day
item is a fallback. Empty completed days say `No more today`, and an unsynced
local date says `Agenda not synced`. This draws from the same retained snapshot
without Wi-Fi or an image download. Optional `endMs` preserves ongoing events;
older snapshots without it show an event only until its start time. Tomorrow's
events require tomorrow's dated snapshot; yesterday's data never appears current.

The SSD1681 waveform finishes asynchronously. GPIO handling continues while
the panel is busy; repeated presses advance the selected page immediately,
and the driver renders the latest selection after the current refresh finishes.
It retains the in-flight frame in ordinary RAM, so queued draws cannot alter
the controller's reference plane. Deep sleep waits for the final refresh,
button release, and 800 ms since the last press. Initial GPIO values do not
trigger actions; the boot wake mask handles the wake press exactly once.
The prior extra wake-suppression flags are removed, including the Down flag
that could swallow the next actual press. Native API cycle actions use the
same scripts as the physical buttons.


## Complete score synchronization

For a wildcard per-child feed, set `scores_expected_count` to its child count
(up to six). Each transfer tracks distinct valid identities separately from the
saved cache; duplicate rows and old cached rows cannot complete a transfer. The
watch waits for the expected count and for every cached identity to be refreshed
before its normal early sleep. A complete canonical `kids` snapshot is atomic
and needs no count. Invalid snapshots do not mark receipt. The bounded battery
deadline still permits sleep when a producer or network is unavailable.
Saved Scores updates immediately after accepted rows, so diagnostics reflect the
actual current cache instead of the previous wake's pre-network value.
