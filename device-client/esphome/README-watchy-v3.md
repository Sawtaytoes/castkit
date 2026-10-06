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

- Menu: cycle clock, locally cached agenda, and CastKit page.
- Back: show the local clock.
- Up/Down: previous/next agenda page; outside the agenda, Up requests a fresh CastKit render and Down redraws.
- Native API actions: `show_clock`, `show_agenda`, `show_castkit`, and `set_image`.
  `set_time(timestamp)` also provisions a valid Unix time when network time is unavailable.

Clock and timer labels use bold type. The local pages show an estimated battery
number inside a solid black battery icon in the top right, without a percent sign.
Solid 20 px bold white digits contrast against the black battery.
The charging bolt sits to the left of the icon and follows the active-low
GPIO10 charger status, rather than the presence of USB power. The diagnostic Device Time and IP Address entities
make synchronization and future OTA updates observable in Home Assistant.

The device subscribes to `castkit/<device_id>/image_url`. Only while the CastKit
page is selected does it request a fresh single-use PNG on
`castkit/<device_id>/refresh/set` and download image updates. Local clock, timer,
agenda, scores and binary pages need no image download or server render.
The local clock still works without CastKit.
A cold start without network time shows `Syncing time...` instead of a false date.

USB detection is GPIO21, distinct from the active-low charge-status GPIO10. On USB the firmware
stays awake for live updates and OTA. On battery it sleeps after receiving its retained agenda, configured timer
and optional scores, allowing one second for queued rows and telemetry.
Otherwise it allows 15 seconds, plus at most 15 more if MQTT is still connecting,
then sleeps until the next minute. Repeated state messages cannot extend that
idle sleep deadline. A running task keeps it connected for updates;
when the task ends or MQTT disconnects it resumes sleeping. Any of the four buttons can wake it. The
clock survives deep sleep on the external 32 kHz crystal. The chosen page is
persisted; the downloaded image is not, so a wake on the CastKit page requests
a fresh URL. Other pages exchange only small retained MQTT state and telemetry.
USB uses Wi-Fi light power saving, but does not disconnect. The bounded idle
window is a connection allowance, not a measured battery life claim. Actual
association time and battery runtime need an unplugged test. MQTT waits for Wi-Fi association and valid local time before DNS/TLS, and automatic MQTT log forwarding is off;
native or serial logs remain available for diagnostics.

With `timer_state_topic` configured, any new running session automatically opens
a local timer with the task name and current whole minutes. Count-up tasks show
today's total (banked minutes plus this run), with this run's elapsed minutes
alongside it; countdown tasks show minutes left. The retained session's start
time survives missed scans and reconnects. Ending the session returns to the clock.
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

Customize the watch face in the package's display lambda and font definitions.
Customize the data page in CastKit's view/channel editor. The initial firmware
has no accelerometer, step counter, vibration alarms or additional watch apps.

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
The watch and Home Assistant use the same rounded percentage function. While charging,
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
{"date":"2026-10-05","events":[{"startMs":1791222000000,"summary":"Practice","isAllDay":false}]}
```

An empty `events` array means a successfully synced day with no events. A producer
must fetch the full local day, include past events, sort by start and publish the
snapshot periodically, at local midnight, and after calendar changes. Do not
publish an empty replacement after a failed fetch. The watch stores one dated
snapshot in NVS, only when its contents change; it survives deep sleep and resets.
Yesterday's snapshot is never presented as today's agenda. Without today's data,
the agenda asks to connect to Wi-Fi. A cold start still needs valid time.

Two complete event rows fit each page; Up/Down reaches every stored event. The
cache holds up to 32 events and shows `+ more` if a day exceeds that capacity.
Titles wrap to two lines and clip with an ellipsis. Its embedded font is ASCII;
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
The dated agenda also remains in flash. A cold start after complete power loss
needs a time source again; the v3 crystal keeps time during deep sleep, rather
than supplying an independently powered RTC.

An optional local scores page shows three children per page using bold names
and totals. Enable it in the private wrapper:

```yaml
substitutions:
  scores_enabled: 'true'
  scores_state_topic: points/state/+
```

The subscription reads Tally Marks' retained per-child state. Down opens scores
from the clock, binary clock, timer or CastKit page. Back returns to the clock. Menu cycles
clock, optional binary clock, agenda, optional scores and CastKit; disabled optional pages are skipped. Up/Down paginate agenda and scores. `show_scores` is also
available through the encrypted native API.

The cache accepts a child's `{kid, kidName, day, pointsToday, displayOrder, ts}`
state, or a dated canonical `{date, kids: [{id, name, pointsToday, displayOrder}]}`
snapshot on the configured topic. `ts` is optional epoch milliseconds. It stores
up to six entries with bounded identities/names, orders them by the producer's
manual order, supports negative scores and saves only changed data. Invalid,
older or oversized snapshots preserve the previous cache. A new day clears old
rows before collecting the new day's children.

Away from Wi-Fi, the page shows the last received scores with their date and an
`Offline / saved` label. It never labels another day's totals as today's score.
Points update only when the watch reconnects; viewing scores makes no ledger
changes. Agenda-only installations can leave scores disabled.


## Binary clock

Set `binary_clock_enabled: 'true'` in the private wrapper to add a local binary
clock immediately after the regular clock in the Menu cycle. Five hour bits
represent 0 through 23; six minute bits represent 0 through 59. Filled dots count
toward their labelled weights (32, 16, 8, 4, 2, 1). Add the filled weights in
each column. The small 24-hour digital time beneath the dots provides a learning
reference. There is no seconds column, so the existing minute refresh and sleep
cadence stays in place. `show_binary_clock` is available through the native API.
This face works offline from the same local clock.

Agenda and scores normalize curly apostrophes to the embedded straight-apostrophe
glyph. Long text remains bounded; unsupported non-ASCII characters are replaced
once per code point rather than splitting UTF-8 in flash.


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
again immediately. USB insertion also wakes the sleeping watch. The Wake Reason
diagnostic reports timer, button, USB or reset to make unwanted wakes observable.
