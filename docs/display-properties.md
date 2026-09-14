# Display properties, and what each one changes

**Date:** 2026-09-13 · **Rule:**
[a display is a panel model plus an installation](decisions/2026-09-13-a-display-is-a-panel-model-plus-an-installation.md)

A registered display is a **panel model** plus an **installation**. The panel
model is what the hardware is. The installation is how this unit is hung and
what the owner wants hidden. Both change the final render, and they change it in
different ways.

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
| `super-slow` | 20–40 s, full refresh with a visible flash | Inky Impression 7.3" E6 | Restate a value a few times an hour. The agenda, a photo, the day's weather. No clock at all. |

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
| Impression E6 | 28 s | clock minute | 2x | refuse |
| Impression E6 | 28 s | current song | 6x | refuse by default |
| Impression E6 | 28 s | the agenda | 128x | show it |

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
  clock-bearing view. It is offered `Agenda`, the photo views, and the weather.
- **Whether the minute re-push reaches it.** `startClockTicker` re-pushes every
  device sitting on a clock view at the top of each minute. On a `super-slow`
  panel that is a panel which is always flashing.
- **Which fields inside a view render.** Now Playing on a `slow` panel prints
  the track, the artist and the album, and prints no position bar. The same view
  on an `instant` panel prints the bar and the running position.
- **Whether an animation is allowed at all.** Only `instant` may animate. On
  `fast` an animation is a stutter; below that it is a flicker.

---

### `colour` — which inks the glass has

| Value | Panels | What it changes |
| --- | --- | --- |
| `mono` | Inky pHAT, M5Paper | One ink. **No hue can carry meaning** — every distinction must be shape, weight, size, position or fill. Continuous-tone content needs dithering. Pure black-and-white content does not. |
| `grayscale` | none today | Hue still carries nothing; tone does. Photos dither to the available levels rather than to two. |
| `e6` | Inky Impression 7.3" | Six inks. A chosen colour is snapped to the nearest ink, so a brand colour will not survive the trip — pick from the palette instead of hoping. Photos need dithering. |
| `e7` | none today | As `e6`, one more ink. |
| `full` | every LCD | Any colour, no dithering, no palette to design around. |

On `mono` and the E-ink palettes, **contrast is the only reliable signal.** A
red "recording" dot and a grey one are the same dot. This is why the weather
views draw a condition mark rather than tinting the temperature.

---

### `dithersItself` — whether the panel's own controller dithers

CastKit dithers when **all three** are true:

1. The content carries colour or continuous tone. **Pure black-and-white
   content needs no dithering on any panel, ever.**
2. `colour` is not `full`.
3. `dithersItself` is `false`.

| Panel | `dithersItself` | Result |
| --- | --- | --- |
| Inky pHAT, Inky Impression | `true` | The Inky library dithers on the Pi. CastKit sends the full-colour downscale and does not quantize. This is what the `off` dither algorithm means. |
| M5Paper | `false` | Nothing downstream dithers. What CastKit emits is exactly what the glass shows, so the dither choice matters more here than anywhere else in the fleet. |
| Every LCD | not applicable | `colour: full`, so there is nothing to reduce. |

A text view on a mono panel therefore takes **no dithering at all**, on any
panel, because the content is already one ink on one background. The dither
setting only starts mattering when a photo, a gradient or album art appears.

---

### `input` — what a person can do to the glass

| Value | Panels | What it changes |
| --- | --- | --- |
| `none` | Inky pHAT, Inky Impression, HyperPixel Round | No control may be the only way to reach a function. Every state the display can be in must be reachable from Home Assistant or the admin panel. A view may still show a control-shaped thing only if it is labelled as status. |
| `touch` | M5Paper, WT32-SC01, HyperPixel Square, Pi Touch 2 | Targets are sized for a finger. ⚠️ On a frame-pushed panel **a target's bounding box IS its touch area** — a hit-area pad drawn on a `::before`, or a part that overflows its box, is discarded silently ([decision](decisions/2026-09-13-a-touch-targets-bounding-box-is-its-touch-area.md)). |
| `pointer` | none today | Hover exists, so a hover affordance is allowed. Nothing in the fleet is here. |

`input` is independent of everything else. The M5Paper is ePaper with touch.
The HyperPixel Round is a colour LCD with none.

---

### `shape` — whether the glass fills its box

| Value | Panels | What it changes |
| --- | --- | --- |
| `rect` | Inky panels, M5Paper, WT32, Pi Touch 2 | Nothing. Every pixel is visible. |
| `square` | HyperPixel 4.0 Square | Nothing beyond the aspect ratio, which the layout reads anyway. |
| `round` | HyperPixel 2.1 Round | CastKit masks the render to the circle, and content takes a safe inset so a corner cannot be clipped. A square preview of a round panel hides exactly the corners the bezel eats, so every preview masks too. |

---

### `delivery` — who draws the pixels

| Value | Panels | What it changes |
| --- | --- | --- |
| `live-browser` | HyperPixel Square, HyperPixel Round, Pi Touch 2 | A kiosk browser loads `/d/<id>` and the Preact SPA renders over one WebSocket. `vw`, `vh` and `vmin` resolve against the panel, so they are safe. JavaScript runs on the panel. |
| `pushed-frames` | Inky pHAT, Inky Impression, WT32-SC01 | CastKit renders a finished frame and publishes it. Nothing runs on the panel. The frame is the entire contract. |
| `pulled-frames` | M5Paper | CastKit publishes a single-use render URL and the panel fetches the PNG over HTTP, because ESPHome cannot consume MQTT image bytes. |

**`delivery` is not panel technology.** The M5Paper is ePaper and the WT32-SC01
is a colour LCD, and both are fed finished frames, because neither runs a
browser. It selects the renderer and nothing else: it does not tell you whether
a panel is interactive, or fast, or colour.

---

### `pixelGrid` — the subpixel stripe

| Value | What it changes |
| --- | --- |
| `none` | Every ePaper panel. Subpixel antialiasing would be coloured noise; grayscale antialiasing is the only correct choice. |
| `rgb-stripe` / `bgr-stripe` | An LCD. Subpixel antialiasing is available and sharpens small text, but only while the stripe runs the way the renderer assumes. |

Two measured facts decide how much this matters.

**For every frame-fed panel, it does not matter at all.** Headless Chromium
renders text with **grayscale** antialiasing and will not do otherwise.
Measured 2026-09-13 on a 320x48 black-on-white text render: 827 antialiased
pixels, **zero** with any colour in them, and the numbers are byte-identical
with `--enable-lcd-text` and with `--disable-lcd-text`. So `pushed-frames` and
`pulled-frames` never carry subpixel fringes, whatever the glass is.

**For a `live-browser` panel it matters only when the panel is mounted
rotated.** Chromium on Linux takes the subpixel order from fontconfig's `rgba`
setting. A panel turned 90 degrees has a vertical stripe, and fontconfig has
`vrgb` and `vbgr` for exactly that case. If a rotated kiosk shows colour
fringing on small text, there are three fixes in order of preference:

1. Set fontconfig `rgba` to `vrgb` or `vbgr` on that Pi, to match the mounted
   stripe.
2. Launch that kiosk's Chromium with `--disable-lcd-text`. Text goes grayscale
   and slightly softer, and the fringes are gone. This is a flag we already
   control.
3. Design around it — larger type, heavier weight. This is the last resort, not
   the first.

⚠️ Unverified on hardware. The fringing case has not been reproduced on a Pi;
the test is to mount a panel rotated, render small text, and photograph it
closely.

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

## The fleet, read as properties

| Panel | `repaint` | `colour` | `dithersItself` | `input` | `shape` | `delivery` | `pixelGrid` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Inky pHAT | `slow` | `mono` | `true` | `none` | `rect` | `pushed-frames` | `none` |
| Inky Impression 7.3" | `super-slow` | `e6` | `true` | `none` | `rect` | `pushed-frames` | `none` |
| M5Paper | `fast` | `mono` | `false` | `touch` | `rect` | `pulled-frames` | `none` |
| WT32-SC01 Plus | `fast` | `full` | n/a | `touch` | `rect` | `pushed-frames` | `rgb-stripe` |
| HyperPixel 4.0 Square | `instant` | `full` | n/a | `touch` | `square` | `live-browser` | `rgb-stripe` |
| HyperPixel 2.1 Round | `instant` | `full` | n/a | `none` | `round` | `live-browser` | `rgb-stripe` |
| Pi Touch Display 2 | `instant` | `full` | n/a | `touch` | `rect` | `live-browser` | `rgb-stripe` |

Read down the "is it ePaper" question and it predicts none of these columns.

---

## What is not enforced yet

This file is the rule. The code does not follow all of it.

1. **Every image-mode device is offered all nine view names.** There is no
   per-device filter on that half; only the browser half filters, and only on
   touch. The Impression is offered `Clock`, `Clock (Weather)` and
   `Clock (Agenda)` today.
2. **The minute re-push does not check `repaint`.** `startClockTicker` pushes
   any device sitting on a clock view, every minute, including a `super-slow`
   one.
3. **`repaint`, `dithersItself` and `pixelGrid` are not on the wire.** The live
   half's `BrowserDeviceProfile` carries `shape`, `hasTouch` and `colour` and
   nothing else.
4. **The freshness rule is followed by accident, not by check.** The ePaper Now
   Playing views print no position; the live one prints a seek bar. Both are
   correct, and nothing would catch it if one changed.

The order of work is in
[the unification plan](2026-09-12-unify-one-view-vocabulary-plan.md).
