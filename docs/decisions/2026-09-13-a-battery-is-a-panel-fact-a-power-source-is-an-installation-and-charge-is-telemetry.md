# A battery is a panel fact, a power source is an installation, and charge is telemetry

- **Status:** Accepted
- **Date:** 2026-09-13
- **Type:** Architecture / Device model
- **Supersedes:** — it adds a panel fact, an installation setting and a third kind of value to [2026-09-13-a-display-is-a-panel-model-plus-an-installation.md](2026-09-13-a-display-is-a-panel-model-plus-an-installation.md), whose two axes are unchanged
- **Superseded by:** —

## Decision

Battery is **three** things, and keeping them apart is the whole point.

| Kind | Name | Example |
| --- | --- | --- |
| Panel fact | `hasBattery` | The M5Paper has a cell. An Inky pHAT does not. |
| Installation | `power` — `wired` \| `battery` | This unit runs off USB today. The next one may hang where there is no socket. |
| Telemetry | `batteryVolts`, `batteryPercent`, `isOnBattery` | 3.94 V, 61 %, false. Changes minute to minute. |

**Telemetry is a third kind of value, and it is not a property.** A property
describes the display and is written by a person. Telemetry describes the
display's current state, is written by the device, and CastKit republishes it.
Neither axis may hold it.

### `power: battery` drops the panel one repaint grade

A battery install costs charge on **every** repaint, so the budget stops being
"seconds per repaint" and becomes **repaints per day**.

> A display installed on battery is offered the view list of the next slower
> repaint grade.

The M5Paper is `repaint: fast`. On mains it may carry a clock — the minute has a
lifetime 120 times its repaint time. On battery it is treated as `slow`, so the
clock comes off and the agenda, weather and photo views stay. The freshness rule
says what a panel **can** show. The power source says what it **should**.

### A battery on a wired install is a UPS, and the useful signal is `isOnBattery`

The M5Paper is plugged in today and still has a cell. The number worth an alert
there is not the percentage. It is the transition: mains went away, the panel is
running on its cell, and somebody should know. `batteryPercent` matters only
once `isOnBattery` is true.

### The last frame on an empty battery is a readable notice

ePaper holds its last frame at **zero power**. So a battery panel that runs flat
does not go blank — it freezes, showing whatever was on the glass, forever,
looking exactly like a working panel with stale data.

Below the low threshold a battery install therefore stops repainting its view
and paints **one** final frame that says the battery is empty. That frame is
what a person finds days later, and it is the difference between "this needs
charging" and "why is the agenda wrong".

### Battery reaches Home Assistant over MQTT, on the CastKit device

The panel publishes to `castkit/<id>/battery`, and CastKit's discovery
publishes a `device_class: battery` sensor plus a binary sensor for
`isOnBattery`. It joins the CastKit device, not a second ESPHome device, because
CastKit already owns this panel's discovery and the node runs `discovery: false`.

An on-glass indicator is a separate decision and is not settled here.

## Context

Every display in the house runs on USB or PoE. The M5Paper is the exception and
nothing in CastKit knows it.

> There's one more thing I forgot that we're not tracking. Battery usage. _All_
> my devices are powered by USB or PoE right now. This M5Paper device _has_ a
> battery. That's a major thing we need to know about.

> If it's a battery-powered device, we might change the kinds of views we show,
> but aside from all that, we might need to add a battery indicator to the screen
> somehow _and_ add it to MQTT. Currently, I have no clue the charge on this
> device, but I'm certain, if we flashed it from ESPHome to get that info, we'd
> know.

The panel is **already** an ESPHome node. It reports its three buttons and takes
a `set_image` action over the native API. It declares no battery sensor, so the
charge is not missing because of the platform — it is missing because nobody
asked for it.

⚠️ **And the current firmware is the worst case for battery life.** The
vendored `m5paper:` component holds the main power rail on precisely so the
panel "stays awake on battery". There is no deep sleep, no wake schedule and no
charge reading. A panel on that firmware, unplugged, drains continuously and
gives no warning.

## Why

Splitting the three kinds prevents the mistake the single word invites. "Battery"
as one field would have to answer "does it have one", "is it using one" and "how
full is it" at once, and those have three different owners: the datasheet, the
person hanging it, and the device.

The one-grade-slower rule reuses machinery that already exists rather than adding
a second, parallel set of view lists. `repaint` already decides which views a
display is offered; a battery install shifts the same lever. A panel that gains
a power lead later moves back without anything else changing.

`isOnBattery` over `batteryPercent` for the alert is the same argument as the
freshness rule, applied to notifications. A percentage on a plugged-in panel sits
at 100 and says nothing for months. The transition is the event.

The empty-battery frame exists because ePaper's best property is also its worst
one here. A zero-power hold is why the panel survives a reboot with its picture
intact; it is also why a dead panel is indistinguishable from a working one.
Every other display kind goes dark and announces itself.

## Evidence

`device-client/esphome/m5paper.yaml` on 2026-09-13: an `api:` block with three
`binary_sensor` buttons, an `mqtt:` block subscribed to
`castkit/m5paper/image_url`, and an `m5paper:` power-latch block with
`battery_power_pin: GPIO5` / `main_power_pin: GPIO2`. No `sensor:` block of any
kind. The vendored component's `__init__.py` accepts only those two pins and
exposes a shutdown action; it reads no voltage.

`rg -l battery` across `docs/`, `packages/server/src` and `packages/shared/src`
returns nothing. CastKit has no battery topic, no discovery payload and no
device field.

The M5Paper's battery voltage is on **GPIO35** through an on-board divider, which
is a mainline ESPHome `adc` sensor and needs no vendored component.
⚠️ The divider ratio and the ESP32 ADC curve are **not verified on this unit**.
The first flash must compare the reported voltage against a meter before the
percentage is trusted.

Chat: T3 Code thread `a7e03562-acab-4308-ba0d-fc93531ece7f`.
