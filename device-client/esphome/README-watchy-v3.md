# Watchy v3: local clock and CastKit page

`watchy-v3.yaml` is an ESPHome package for the SQFMI Watchy v3 only: ESP32-S3,
8 MB flash, no PSRAM, and the 200 x 200 monochrome display. It uses mainline
ESPHome components. Earlier revisions have different processors, pins and RTCs.

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

- Menu: show the CastKit page and request a fresh render.
- Back: show the local clock.
- Up: request a fresh CastKit render.
- Down: redraw the current page.
- Native API actions: `show_clock`, `show_castkit`, and `set_image`.
  `set_time(timestamp)` also provisions a valid Unix time when network time is unavailable.

Clock and timer labels use bold type. The local pages show an estimated battery
percentage and mark USB power. The diagnostic Device Time and IP Address entities
make synchronization and future OTA updates observable in Home Assistant.

The device subscribes to `castkit/<device_id>/image_url` and downloads the
single-use PNG. On MQTT connection, it requests a new image on
`castkit/<device_id>/refresh/set`. The local clock still works without CastKit.
A cold start without network time shows `Syncing time...` instead of a false date.

USB detection is GPIO21, not the charge-status GPIO10. On USB the firmware
stays awake for live updates and OTA. On battery it stays awake for 15 seconds,
then sleeps until the next minute. A running task keeps it connected for updates;
when the task ends or MQTT disconnects it resumes sleeping. Any of the four buttons can wake it. The
clock survives deep sleep on the external 32 kHz crystal. The chosen page is
persisted; the downloaded image is not, so every wake requests a fresh URL.

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
