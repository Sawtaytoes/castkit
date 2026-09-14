# Display properties, and what each one changes

**Date:** 2026-09-13 · **Rule:**
[a display is a panel model plus an installation](decisions/2026-09-13-a-display-is-a-panel-model-plus-an-installation.md)

A registered display is a **panel model** plus an **installation**. The panel
model is what the hardware is. The installation is how this unit is hung, how it
is powered, and what the owner wants hidden. Both change the final render, and
they change it in different ways.

A third kind of value sits beside them: **telemetry**. It describes what the
display is doing right now, the device writes it, and it is not a property.

This file is the reference. Every value below states what it changes, because a
property that does not say what it changes is a label, not a model.

---

## Axis A — panel facts

### `repaint` — how long the glass takes to show a new frame

This is the property that decides **which views a display is offered** and
**which values those views may print**.

| Value | Repaint | Panels | What the panel can do |
| --- | --- | --- | --- |
| `instant` | under ~100 ms | HyperPixel Square, HyperPixel Round, Pi Touch 2 | Anything. A second hand, a seek bar that counts down, a drag that follows the finger. |
| `fast` | under ~1 s, partial update, no full flash | M5Paper, WT32-SC01 | Restate a value about once a second. A clock with minutes, a coarse progress bar, a swipe that lands within a frame or two. |
| `slow` | 2–5 s, full refresh | Inky pHAT | Restate a value about once a minute. The time, the current song, the weather. No seconds and no countdown. |
| `super-slow` | 20–40 s, full refresh with a visible flash | Inky Impression 7.3" E Ink Spectra 6 | Restate a value a few times an hour. The agenda, a photo, the day's weather. No clock at all. |

The line between `slow` and `super-slow` is not a matter of degree. A 3-second
panel can carry a clock, because the minute is still the right minute when the
panel finishes. A 28-second panel cannot, because the next minute arrives while
it is still drawing the last one.

#### The freshness rule

> A view may show a value only if the value will still be true when the panel
> finishes drawing it.

The test: show a value when its **lifetime** is at least **ten times** the
panel's repaint time.

| Value a view might print | Lifetime |
| --- | --- |
| a seek position, a second hand, a live drag | 1 s |
| the minute on a clock | 60 s |
| the current song, the next-song start time | ~3 min |
| the weather | ~30 min |
| the day's agenda, a photo on a slow rotation | hours |

Applied:

| Panel | Repaint | Value | Ratio | Verdict |
| --- | --- | --- | --- | --- |
| HyperPixel Square | instant | seek position | very large | show it |
| M5Paper | ~0.5 s | clock minute | 120x | show it |
| M5Paper | ~0.5 s | seek position | 2x | refuse |
| Inky pHAT | 3 s | clock minute | 20x | show it |
| Inky pHAT | 3 s | current song | 60x | show it |
| Inky pHAT | 3 s | time remaining | 0.3x | refuse |
| Impression E Ink Spectra 6 | 28 s | clock minute | 2x | refuse |
| Impression E Ink Spectra 6 | 28 s | current song | 6x | refuse by default |
| Impression E Ink Spectra 6 | 28 s | the agenda | 128x | show it |

Ten is a default, not a law. A view may state a stricter requirement of its own.

#### Absolute beats relative

Where a view can state the same fact two ways, a `slow` or `super-slow` panel
gets the absolute form.

| Relative — dies immediately | Absolute — lives as long as the fact |
| --- | --- |
| "3:21 remaining" | "Next song at 9:42" |
| "in 20 minutes" | "Standup at 10:00" |
| "2 hours ago" | "Last watered Tuesday" |

"3:21 remaining" is already wrong when a 3-second panel finishes drawing it.
"Next song at 9:42" stays true for the whole track, so the same panel can print
it.

#### What `repaint` changes, concretely

- **Which views the display is offered.** A `super-slow` panel is not offered a
  clock-bearing view. It is offered `Agenda` and the three photo views.
  ⚠️ Not the weather: the only weather view today is `Clock (Weather)`, which
  carries a clock. A weather-only view does not exist yet.
- **Whether the minute re-push reaches it.** `startClockTicker` re-pushes every
  device sitting on a clock view at the top of each minute. On a `super-slow`
  panel that is a panel which is always flashing.
- **Which fields inside a view render.** Now Playing on a `slow` panel prints
  the track, the artist and the album, and prints no position bar. The same view
  on an `instant` panel prints the bar and the running position.
- **Whether an animation is allowed at all.** Only `instant` may animate. On
  `fast` an animation is a stutter; below that it is a flicker. Enforced since
  2026-09-14 by a blanket rule on `html:not([data-repaint="instant"])`, so a
  view written next year inherits it without its author knowing the rule
  exists.

---

### `colorMode` — which inks the glass has

| Value | Example panels | What it changes |
| --- | --- | --- |
| `monochrome` | Inky pHAT, M5Paper | One ink. **No hue can carry meaning** — every distinction must be shape, weight, size, position or fill. Continuous-tone content needs dithering. Pure black-and-white content does not. |
| `grayscale` | none today | Hue still carries nothing; tone does. Photos dither to the available levels rather than to two. |
| `spectra6` | Inky Impression 7.3" | Six inks. A chosen color is snapped to the nearest ink, so a brand color will not survive the trip — pick from the palette instead of hoping. Photos need dithering. |
| `galleryPalette7` | none today | ACeP / E Ink Gallery Palette (7 color). As `spectra6`, one more ink. Not in this fleet. |
| `full` | every LCD | Any color, no dithering, no palette to design around. |

On `monochrome` and the ePaper palettes, **contrast is the only reliable
signal.** A red "recording" dot and a gray one are the same dot. This is why the
weather views draw a condition mark rather than tinting the temperature.

⚠️ **There is no such thing as "E7".** An earlier draft of this file listed
`e6` and `e7` as if they were a matched pair. `E6` is real — it is **E Ink
Spectra 6**, and panel part numbers carry `(E6)`. The seven-color technology is
real too, but it is **ACeP / E Ink Gallery Palette**, and vendors code those
panels `(F)`. Nothing is called E7. The value is `galleryPalette7`.

⚠️ **Two names for one property, for now.** An image device carries
`colorMode`; a browser device's profile still spells the same idea `color`.
That is an inconsistency, not a distinction, and unifying it is a protocol
change listed in
[the unification plan](2026-09-12-unify-one-view-vocabulary-plan.md).

---

### `hasPanelDithering` — whether the panel's own controller dithers

CastKit dithers when **all three** are true:

1. The content carries color or continuous tone. **Pure black-and-white
   content needs no dithering on any panel, ever.**
2. `color` is not `full`.
3. `hasPanelDithering` is `false`.

| Panel | `hasPanelDithering` | Result |
| --- | --- | --- |
| Inky pHAT, Inky Impression | `true` | The Inky library dithers on the Pi. CastKit sends the full-color downscale and does not quantize. This is what the `off` dither algorithm means. |
| M5Paper | `false` | Nothing downstream dithers. What CastKit emits is exactly what the glass shows, so the dither choice matters more here than anywhere else in the fleet. |
| Every LCD | not applicable | `color: full`, so there is nothing to reduce. |

A text view on a mono panel therefore takes **no dithering at all**, on any
panel, because the content is already one ink on one background. The dither
setting only starts mattering when a photo, a gradient or album art appears.

---

### `input` — what a person can do to the glass

| Value | Example panels | What it changes |
| --- | --- | --- |
| `none` | Inky pHAT, Inky Impression, HyperPixel Round | No control may be the only way to reach a function. Every state the display can be in must be reachable from Home Assistant or the admin panel. A view may still show a control-shaped thing only if it is labeled as status. |
| `touch` | M5Paper, WT32-SC01, HyperPixel Square, Pi Touch 2 | Targets are sized for a finger. ⚠️ On a frame-pushed panel **a target's bounding box IS its touch area** — a hit-area pad drawn on a `::before`, or a part that overflows its box, is discarded silently ([decision](decisions/2026-09-13-a-touch-targets-bounding-box-is-its-touch-area.md)). |
| `pointer` | none today | Hover exists, so a hover affordance is allowed. Nothing in the fleet is here. |

`input` is independent of everything else. The M5Paper is ePaper with touch.
The HyperPixel Round is a color LCD with none.

---

### `hasBattery` — whether the panel carries a cell

| Value | Example panels | What it changes |
| --- | --- | --- |
| `false` | Inky pHAT, Inky Impression, WT32-SC01, every HyperPixel, Pi Touch 2 | Nothing. The display is on when its supply is on. Loss of power is loss of the display, and nobody has to be told a number. |
| `true` | M5Paper | The display can be hung where there is no socket, can keep running through a power cut, and can **run out**. It gains telemetry, a low threshold, and an end state. |

`hasBattery` is a fact about the hardware. Whether this unit is *using* the cell
is [`power`](#the-installation), and how full the cell is, is
[telemetry](#axis-c--telemetry).

⚠️ **On ePaper, a flat battery does not look flat.** The glass holds its last
frame at zero power, so a panel that dies keeps showing yesterday's agenda and
looks like a working display with wrong data. Every other display kind goes
dark and announces itself. This is why a battery install paints a final
"battery empty" frame instead of simply stopping, and why the on-glass mark
appears at the low threshold rather than never.

---

### `shape` — whether the glass fills its box

| Value | Example panels | What it changes |
| --- | --- | --- |
| `rectangle` | Inky panels, M5Paper, WT32, Pi Touch 2 | Nothing. Every pixel is visible. |
| `square` | HyperPixel 4.0 Square | Nothing beyond the aspect ratio, which the layout reads anyway. |
| `round` | HyperPixel 2.1 Round | CastKit masks the render to the circle, and content takes a safe inset so a corner cannot be clipped. A square preview of a round panel hides exactly the corners the bezel eats, so every preview masks too. |

---

### `delivery` — who draws the pixels

| Value | Example panels | What it changes |
| --- | --- | --- |
| `live-browser` | HyperPixel Square, HyperPixel Round, Pi Touch 2 | A kiosk browser loads `/d/<id>` and the Preact SPA renders over one WebSocket. `vw`, `vh` and `vmin` resolve against the panel, so they are safe. JavaScript runs on the panel. |
| `pushed-frames` | Inky pHAT, Inky Impression, WT32-SC01 | CastKit renders a finished frame and pushes it. Nothing on the panel decides what to draw. ⚠️ **Two transports carry this**: the Pi receivers take the PNG as a retained MQTT payload on `<base>/image`; the WT32-SC01 takes base64 chunks through the ESPHome native API's `frame_chunk` action. |
| `pulled-frames` | M5Paper | MQTT carries the **signal** — a single-use render URL on `<base>/image_url` — and HTTP carries the **bytes**, fetched by stock `online_image`. |

**`delivery` is not panel technology.** The M5Paper is ePaper and the WT32-SC01
is a color LCD, and both are fed finished frames — for different reasons.

⚠️ **It is not "because ESPHome cannot consume MQTT image bytes" either.** Both
of those panels run ESPHome. The WT32-SC01 is fed *pushed* bytes, decoded by a
custom `castkit_display` component, and has no `http_request` and no
`online_image` at all. The M5Paper pulls because it runs **stock** components,
and `online_image` is an HTTP client. That is a fact about one firmware's
component set, not a limit of ESPHome.

Nothing runs on the M5Paper. The WT32-SC01's frames *are* produced by a browser
— that browser runs on the worker host, and the panel is a remote framebuffer
with a touch return path.

`delivery` selects the renderer and the transport, and nothing else: it does not
tell you whether a panel is interactive, or fast, or color.

---

### `pixelGrid` — the subpixel stripe

| Value | What it changes |
| --- | --- |
| `none` | Every ePaper panel. Subpixel antialiasing would be colored noise; grayscale antialiasing is the only correct choice. |
| `rgb-stripe` / `bgr-stripe` | An LCD. Subpixel antialiasing is available and sharpens small text, but only while the stripe runs the way the renderer assumes. |

Two measured facts decide how much this matters.

**For every frame-fed panel, it does not matter at all.** Headless Chromium
renders text with **grayscale** antialiasing and will not do otherwise.
Measured 2026-09-13 on a 320x48 black-on-white text render: 827 antialiased
pixels, **zero** with any color in them, and the numbers are byte-identical
with `--enable-lcd-text` and with `--disable-lcd-text`. So `pushed-frames` and
`pulled-frames` never carry subpixel fringes, whatever the glass is.

**For a `live-browser` panel it matters only when the panel is mounted
rotated.** Chromium on Linux takes the subpixel order from fontconfig's `rgba`
setting. A panel turned 90 degrees has a vertical stripe, and fontconfig has
`vrgb` and `vbgr` for exactly that case.

**CastKit handles this itself as of 2026-09-14.** The page shell stamps
`data-grayscale-text` on `:root`, computed from the stripe AND the mount, and
the stylesheet answers it with `-webkit-font-smoothing: antialiased`. In Blink
that forces grayscale antialiasing, which is what `--disable-lcd-text` does —
without needing a launch flag on somebody else's Pi. It fires in two cases:
`pixelGrid: none`, and a stripe on a panel hung at 90 or 270 degrees. A half
turn is left alone, because it keeps the stripe horizontal and only reverses
the order, which is a `pixelGrid` value to correct rather than a reason to give
subpixel rendering up.

There is still a better fix for the rotated case, and it is not ours to make:

1. Set fontconfig `rgba` to `vrgb` or `vbgr` on that Pi, to match the mounted
   stripe. The stripe then gets used instead of abandoned, and the panel's
   `pixelGrid` should be set to `none` only if it genuinely has no stripe.
2. Design around it — larger type, heavier weight. This is the last resort, not
   the first.

⚠️ Unverified on hardware. The fringing case has not been reproduced on a Pi;
the test is to mount a panel rotated, render small text, and photograph it
closely. What IS verified is the mechanism: four tests in real Chromium assert
the computed `-webkit-font-smoothing` and the computed transition against the
real stylesheet.

---

## Axis B — the installation

These belong to one unit on one wall. Two units of the same model can differ in
every one of them.

### `orientation`

How this unit is mounted. It fixes **the layout box** — the width and height a
view lays itself out in.

⚠️ **The layout box is the firmware's canvas, not the datasheet pair.** The
M5Paper's glass is 540x960 portrait and its firmware drives it as a 960x540
landscape canvas. Registering the datasheet pair composed every text view for a
540px-wide box and then tipped it on its side, for six weeks
([decision](decisions/2026-09-11-a-panels-registry-size-is-its-layout-box-and-rotation-never-re-lays-out.md)).

Rotation turns the **finished** frame to cancel out the mount. It never re-runs
the layout. A quarter turn does not give a landscape view of a portrait panel;
it gives the portrait view, on its side.

A second M5Paper hung portrait is the same panel model with a different
installation. Nothing about the glass changed.

### `power`

How **this unit** is actually supplied. A panel with a cell may still be plugged
in; the M5Paper is, today.

| Value | What it changes |
| --- | --- |
| `wired` | Nothing about the view list. If `hasBattery` is `true` the cell is a UPS, and the signal worth an alert is `isOnBattery` going true, not the percentage. |
| `battery` | Every repaint costs charge. The budget becomes **repaints per day**, not seconds per repaint. |

**A display installed on battery is offered the view list of the next slower
repaint grade.** Enforced since 2026-09-14: `power` is a device field and
`getViewsForDevice` runs `getEffectiveRepaint` over it.

| Panel | `repaint` | On `wired` | On `battery` |
| --- | --- | --- | --- |
| M5Paper | `fast` | treated as `fast` | treated as `slow` |

⚠️ **This does not take the clock off the M5Paper, and an earlier version of
this file wrongly said it did.** `slow` still passes the freshness rule for a
clock minute — that is the whole reason the 3-second Inky pHAT can show one.
Dropping a grade changes what the panel is *offered* only where the two grades
actually differ, and `fast` and `slow` offer the same list today.

The clock comes off at `super-slow`, and only there. What a battery install
really buys is fewer repaints per day, which is a budget, not a view filter.

The freshness rule says what a panel **can** show. `power` says what it
**should**. A panel that gains a power lead later moves back with no other
change.

Two more consequences:

- **A sleeping device cannot be pushed to.** A battery ESP32 that deep-sleeps
  between updates is unreachable on demand, so CastKit queues and the device
  pulls on wake. The M5Paper is already `delivery: pulled-frames` for an
  unrelated reason, which fits.
  ⚠️ It does **not** sleep today. Its firmware holds the power rail on
  deliberately, which is the worst case for battery life.
- **Below the low threshold, stop repainting the view and paint one notice.**
  See `hasBattery` for why a silent stop is worse than a message.

---

### `margins`

Push content in from the edge, so a bezel or a frame cannot eat it. The content
still lays out inside the smaller box, so text reflows.

### `crop`

Cut content away at the edge. A margin pushes in; a crop cuts off. They are two
controls and they are not interchangeable
([decision](decisions/2026-09-08-margin-pushes-in-and-crop-cuts-away.md)).

### `mask`

Which pixels are visible. Seeded from `shape` — a round panel starts with a
circle — and adjustable per unit, because a case, a frame or a mount can hide
pixels the glass technically has.

---

## Axis C — telemetry

Not properties. The device writes these, they change minute to minute, and
CastKit republishes them.

| Value | Type | What it is for |
| --- | --- | --- |
| `batteryVolts` | number | The raw reading. Honest, and the only value that survives a wrong calibration. |
| `batteryPercent` | number | Derived from the voltage. Needs a calibrated curve before anyone should trust it. |
| `isOnBattery` | boolean | Mains present or not. On a `wired` install with a cell, this going true is the alert. ⚠️ A device with no VBUS sense line reports a **proxy** — see below. |

⚠️ **`isOnBattery` is only as good as the device's sense line, and the M5Paper
has none.** The panel exposes no VBUS input, so its firmware infers the field
from the cell voltage. Measured on 2026-09-14, a plugged-in full panel rests at
**4.13-4.14 V**, so any threshold near the charge ceiling reads true on a panel
that has never been unplugged. Its test fires below 3.95 V and clears above
4.05 V, which means "the cell has carried this panel for a while", not "the
power just went out". CastKit must treat the field as **lagging by hours** on
such a device, and must not build a mains-failure alert on it.

They reach Home Assistant over MQTT on the **CastKit** device: the panel
publishes to `castkit/<id>/battery`, and CastKit's discovery publishes a
`device_class: battery` sensor plus a binary sensor for `isOnBattery`. It does
not arrive as a second ESPHome device, because CastKit already owns this panel's
discovery and the node runs with `discovery: false`.

**On the glass, the battery appears only when it is low**
([decision](decisions/2026-09-14-a-battery-indicator-appears-on-the-glass-only-when-the-battery-is-low.md)).

| State | What the glass shows |
| --- | --- |
| Above the low threshold | Nothing. The view has the whole panel. |
| Below the low threshold | The view, plus a battery mark drawn as an **overlay**. No view reserves room for it. |
| Empty | The view stops repainting, and one final frame says the battery is empty. |

The mark is a shape, never a color — the only panel in the fleet with a cell is
`color: monochrome`. The threshold is a setting in the admin panel, and a wired panel
never reaches it, so the mark stays off for months and means something when it
appears.

---

## Reading a real fleet

This file is the model. It deliberately carries **no inventory** — which panels
a particular house owns, and how each one is hung, is not CastKit's business and
would tell a stranger about somebody's home.

To read a deployment, write the same table for it: one row per panel, one column
per property above. The useful test is to add an "is it ePaper?" column and see
how much it predicts. The answer is none of the others — which is the whole
argument for keying behavior on properties instead of on panel technology.

---

## What is not enforced yet

This file is the rule. The code does not follow all of it.

1. ~~Every image-mode device is offered all nine view names.~~ **Done
   2026-09-14.** `getViewsForDevice` runs the freshness rule over every view
   and the discovery `select` carries only what the panel can draw. A
   `super-slow` panel is offered four views and no clock. Measured against a
   real deployment: three Impressions dropped from nine views to four, and
   nothing else changed.
2. ~~The minute re-push does not check `repaint`.~~ **Done 2026-09-14.**
   `startClockTicker` now skips a device whose active view is not in its own
   allowed list, which catches a panel parked on a clock view by a retained
   state written before the filter existed.
3. ~~`repaint`, `hasPanelDithering` and `pixelGrid` are not on the wire.~~
   **Done 2026-09-14.** `BrowserDeviceProfile` carries `repaint`,
   `hasPanelDithering`, `pixelGrid` and `delivery`, and the page shell stamps
   all of them on `:root` with the layout box and the derived
   `data-grayscale-text`. The client re-stamps from the live profile, so an
   edit reaches a panel without somebody walking to the glass. Two rules read
   the stamp today: only an `instant` panel may animate, and a panel whose
   stripe cannot be trusted antialiases text in gray.
   ⚠️ None of the three is written in any devices file, so all three are
   **derived** for now, the same way `repaint` is on the image half — see
   item 6. A live-browser panel derives honestly: it is the browser that draws
   the frame, nothing sits between that frame and the glass, and a full-color
   panel is an LCD with a stripe.
4. **The battery reaches Home Assistant. It does not reach the glass.**
   Since 2026-09-14 the M5Paper firmware reads the cell and publishes a
   retained `castkit/m5paper/battery` message with `volts`, `percent` and
   `isOnBattery` — measured that day at 4.29 V settling to 4.13 V, and
   `isOnBattery: false`.
   **Done the same day:** `hasBattery` and `power` are real device fields, a
   `hasBattery` panel publishes three diagnostic entities on the display Home
   Assistant already has for it (`Battery`, `Battery voltage`, `On battery`),
   and a `power: battery` install is graded one repaint step slower.
   ⚠️ The three entities point at the PANEL's retained topic. CastKit
   deliberately does not republish a copy — that would be a second writer, a
   staleness window, and no way to tell which of the two was right.
   **Still missing:** the low-battery mark on the glass, the threshold that
   turns it on, and the final "battery empty" frame. The firmware also still
   holds the power rail on, so an unplugged panel drains continuously; the
   difference is that the drain is now visible on the broker instead of
   invisible everywhere.
5. **The freshness rule gates the view LIST, not the fields inside a view.**
   `getViewsForDevice` decides which views a panel is offered. It does not stop
   a view printing a value that is too short-lived for that panel. The ePaper
   Now Playing views print no position and the live one prints a seek bar; both
   are correct, and nothing would catch it if one changed.
6. **`repaint` is inferred when a device does not declare one.** It is now
   declarable: an image device may carry `repaint`, a browser device may carry
   `repaint`, `hasPanelDithering` and `pixelGrid`, and an explicit value always
   wins. Before 2026-09-14 the schema REJECTED the key, so there was no way to
   correct a wrong inference short of editing the inference.
   ⚠️ No deployment declares one yet, so every panel in the fleet is still
   running on `getDefaultRepaint`, which reads the grade off `imageDelivery`
   and `colorMode`. It gets every panel in the current fleet right. A new panel
   kind that breaks the pattern is graded wrongly until somebody sets one —
   the difference is that now somebody can.

The order of work is in
[the unification plan](2026-09-12-unify-one-view-vocabulary-plan.md).
