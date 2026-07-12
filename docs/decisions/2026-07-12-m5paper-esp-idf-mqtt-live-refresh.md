# The M5Paper self-refreshes over MQTT: esp-idf firmware subscribes to a render-URL topic

- **Status:** Accepted
- **Date:** 2026-07-12
- **Type:** Architecture / Device delivery
- **Supersedes:** —
- **Superseded by:** —
- **Amends:** [2026-07-08-m5paper-image-plus-touch-plus-fast-update.md](2026-07-08-m5paper-image-plus-touch-plus-fast-update.md) (the refresh *signal* only)

## Decision

The M5Paper updates itself on a live cadence **driven by the CastKit server over
MQTT**, not by Home Assistant and not by a manual push script. Concretely:

1. **Server:** a device may declare `imageDelivery: "http-pull"` in the registry.
   For such a device, after every render `pushDevice` mints a single-use render
   token and publishes its URL (e.g. `https://<castkit>/render/<token>.png`) to
   **`castkit/<id>/image_url`** — published **non-retained** (a consumed or
   expired token would 404 on reconnect). The publish is **gated by a per-device
   SHA-256 of the rendered PNG**: an unchanged frame is skipped so an idle panel
   doesn't needlessly reflash. The existing per-minute `clockTicker` already
   re-renders every clock-bearing panel, so this yields live minute updates for
   free.
2. **Panel:** the firmware runs the **esp-idf** framework (migrated off arduino)
   so it can run ESPHome's native MQTT client **with TLS** — the household broker
   is TLS-only, and ESPHome only supports MQTT-over-TLS on esp-idf. The panel
   subscribes to `castkit/<id>/image_url`, re-points `online_image` at the payload
   URL, and pulls the PNG over HTTP. **MQTT carries the *signal*; HTTP carries the
   *bytes*.**

The refresh path in the [2026-07-08 decision](2026-07-08-m5paper-image-plus-touch-plus-fast-update.md)
— "HA calls the `set_image` ESPHome API action with a token URL" — is **amended**:
that action remains as a manual/HA fallback, but the live path is now the MQTT
subscription above. Touch, edge buttons, and the fast-update overlay from that
decision are unchanged.

## Context

The panel painted CastKit renders correctly but only when *something* called its
`set_image` action — a manual script. Kevin's direction was that **CastKit** (not
HA) should own the minute-by-minute updates. Half of that already existed: the
server's `clockTicker` re-renders and re-publishes every clock-bearing panel each
minute. The only missing link was delivery — the ESPHome panel can't consume MQTT
*image bytes*, only fetch a PNG over HTTP.

Option A (this decision) — CastKit publishes a render **URL** over MQTT, panel
subscribes + fetches — was chosen over calling the ESPHome native API from a Node
process (which needs an unvetted native-API library, off-limits under the
no-unvetted-software rule) and over raw-PNG-over-MQTT (ESPHome has no such path).

The wrinkle Option A hit: the broker is **TLS-only** (no plaintext listener), and
ESPHome MQTT-TLS requires the **esp-idf** framework, while the panel ran arduino
with hand-patched vendored components. Kevin chose to migrate the framework rather
than weaken broker security or add a sidecar. The vendored `it8951e`/`m5paper`
components turned out to be framework-agnostic (ESPHome HAL + esp-idf
`driver/gpio.h`) and compiled under esp-idf with **no code changes** — only the
`framework: type:` line changed.

## Why

- **House-consistent.** Service↔service refresh now rides MQTT (the workspace hard
  rule); only the image *bytes* use the tiny HTTP-pull already blessed by the
  [HTTP-image decision](2026-07-03-esphome-http-image-delivery.md). Arguably *more*
  consistent than the old HA-API refresh.
- **No HA in the loop, no manual script, self-healing.** Survives a CastKit
  restart (hash map resets → first push re-delivers) and a panel reboot (panel
  reconnects and the next minute tick delivers within ≤60 s; e-ink holds the last
  frame meanwhile).
- **e-ink wear bounded.** The per-device hash suppresses redundant full refreshes;
  a clock legitimately changes each minute, but static agenda/now-playing frames
  don't reflash.
- **TLS without a re-flash treadmill.** The broker cert is validated against the
  embedded long-lived **ISRG Root X1** with `skip_cert_cn_check`, so Let's Encrypt
  leaf renewals need no firmware change.

## Evidence

- Kevin: *"the CastKit server could handle the minute-by-minute updates. It would
  be a lot for HA."*
- When the TLS/framework wrinkle surfaced, Kevin chose **"migrate panel to
  ESP-IDF"** over the sidecar / plaintext-listener / unvetted-lib alternatives.
- Verified 2026-07-12: esp-idf build compiled clean; OTA flashed without a brick;
  the panel connected TLS MQTT and downloaded fresh renders at **03:50:01 and
  03:51:01 (60 s apart)** off the `image_url` messages, with CastKit publishing a
  new URL each minute. (`Pin busy timeout` on the it8951e persists — a separate,
  documented, non-fatal follow-up.)
