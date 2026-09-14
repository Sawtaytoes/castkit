# A display is a set of properties, and panel technology is not one of them

- **Status:** Superseded
- **Date:** 2026-09-13
- **Type:** Architecture / Device model
- **Supersedes:** — it names the property vocabulary that [2026-09-12-castkit-is-one-app-with-one-view-vocabulary-not-inkcast-plus-slatecast.md](2026-09-12-castkit-is-one-app-with-one-view-vocabulary-not-inkcast-plus-slatecast.md) left as "the properties", and replaces that plan's three-field sketch (`needsTouch` / `needsLiveRender` / `isRepaintCheap`)
- **Superseded by:** [2026-09-13-a-display-is-a-panel-model-plus-an-installation.md](2026-09-13-a-display-is-a-panel-model-plus-an-installation.md) — it keeps the property model and the "panel technology is not an axis" rule, splits the installation settings out of the hardware list, adds a fourth `repaint` grade, and requires every value to state what it changes

## Decision

**A registered display is one record of nine independent properties. "ePaper"
and "LCD" are not among them, are not derivable from them, and are never the
subject of a branch in code, in CSS, in a test name or in a Storybook title.**

| Property | Values | What reads it |
| --- | --- | --- |
| `size` | `width` × `height`, in the orientation the device presents | Every layout. It is the layout box, not the datasheet pair ([2026-09-11](2026-09-11-a-panels-registry-size-is-its-layout-box-and-rotation-never-re-lays-out.md)). |
| `rotation` | `0` \| `90` \| `180` \| `270` | The receiver, applied to the finished frame. It never re-runs the layout. |
| `shape` | `rect` \| `square` \| `round` | The internal mask and the safe inset. A shape that does not fill its box is masked by CastKit, so no view draws into pixels the glass cannot show. |
| `pixelGrid` | the glass's own pixel pair, plus subpixel order `rgb-stripe` \| `bgr-stripe` \| `none` | Text antialiasing, and the `size`-against-datasheet check. Subpixel AA on a `none` grid (any ePaper) is coloured noise; on a `bgr-stripe` panel an RGB assumption fringes every glyph the wrong way. |
| `colour` | `mono` \| `grayscale` \| `e6` \| `e7` \| `full` | The palette, the contrast floor, and whether a view may signal with hue at all. |
| `ditheredBy` | `castkit` \| `panel` \| `none` | Whether the pipeline quantises. `panel` means the controller does it (the Inky library); `none` means nobody does, so what we emit is exactly what the glass shows (the M5Paper). |
| `repaint` | `instant` \| `fast` \| `slow`, derived from full-frame milliseconds and whether partial update exists | Whether a view may carry a second hand, a moving progress bar, a crossfade, or a live drag. |
| `input` | `none` \| `touch` \| `pointer` | Whether controls exist at all, and how big they are. |
| `delivery` | `live-browser` \| `pushed-frames` \| `pulled-frames` | Which renderer draws the view. Nothing else. |

Two rules follow from the table, and they are the whole point of it.

1. **No property implies another.** The M5Paper is ePaper with `input: touch`
   and a `repaint` fast enough to animate. The WT32-SC01 is a colour LCD with
   `delivery: pushed-frames`, because an ESP32 has no browser — so it is fed
   exactly the way an Inky is. The Inky Impression is `ditheredBy: panel`; the
   M5Paper beside it is `ditheredBy: none`. Any code that reads one of these
   properties and concludes another is wrong about a panel we already own.
2. **A view declares the properties it needs; it never names a device or a
   panel kind.** "This needs `input: touch`" is a requirement. "This is the
   ePaper one" is not a requirement, it is a leftover from two products.

## Context

CastKit was Inkcast plus Slatecast, and the seam is still in the type system.
The image half carries `DeviceMetadata` — `colourMode`, `rotation`,
`ditherProfile`, `imageDelivery`. The live half carries `BrowserDeviceProfile` —
`shape`, `hasTouch`, `colour`, `externalViews`. Neither is a superset of the
other, both describe the same nine facts about a piece of glass, and four facts
appear in neither: `pixelGrid`, `repaint`, panel-side dithering as distinct from
our own, and the mask a non-rectangular panel needs.

The household fleet already breaks every shortcut the two-type split encodes:

| Panel | Technology | `input` | `delivery` | `ditheredBy` | `repaint` |
| --- | --- | --- | --- | --- | --- |
| Inky pHAT | ePaper mono | `none` | `pushed-frames` | `panel` | `slow` |
| Inky Impression 7.3" | ePaper E6 | `none` | `pushed-frames` | `panel` | `slow` |
| M5Paper | ePaper mono | `touch` | `pulled-frames` | `none` | `fast` |
| WT32-SC01 Plus | colour LCD | `touch` | `pushed-frames` | `none` | `fast` |
| HyperPixel 4.0 Square | colour LCD | `touch` | `live-browser` | `none` | `instant` |
| HyperPixel 2.1 Round | colour LCD | `none` | `live-browser` | `none` | `instant` |
| Pi Touch Display 2 | colour LCD | `touch` | `live-browser` | `none` | `instant` |

Read down the technology column and nothing else lines up with it. Read down
`delivery` and the M5Paper sits with the WT32, an ePaper panel and an LCD
sharing one pipeline for the same reason: neither can run a browser.

## Why

The owner put it plainly: *"it's not the screen type that matters, but the way
you interact with it."* Panel technology is a purchasing fact. It predicts the
other properties only for panels we happened to buy first, and it has already
mispredicted three of the seven we own.

Nine properties instead of two types is not more complexity, it is the same
complexity written where it can be read. Today the difference between a panel
that may show a seek bar and one that may not is spread across a package
boundary, two registries, two discovery builders and two Storybooks. As a
property it is one field, one predicate, and one axis a test can enumerate.

`pixelGrid` earns its place despite sounding like trivia. It is what separates
the glass from the canvas, and getting that wrong composed every M5Paper text
view for a 540px-wide box and then tipped it on its side for six weeks.

`repaint` is graded rather than boolean because the fleet is graded. An Inky
full refresh is measured in seconds and ghosts; the M5Paper does partial
updates fast enough that the owner reads it as comparable to an LCD; an LCD is
instant. A boolean would put the M5Paper on the wrong side whichever way it
fell.

`delivery` is deliberately the only property that selects a renderer, and it
selects nothing else. That is what keeps "is it interactive" and "how does it
get its pixels" from collapsing back into one idea, which is the exact collapse
that produced two products.

## Evidence

The fleet table above is read from `home-displays/AGENTS.md` and from
`packages/core/src/devices/device.ts` on 2026-09-13. The M5Paper row —
ePaper, touch, `http-pull`, no panel dithering — is from
[2026-07-08-m5paper-image-plus-touch-plus-fast-update.md](2026-07-08-m5paper-image-plus-touch-plus-fast-update.md)
and the ESPHome node config. The WT32 row is from
[2026-09-10-an-esphome-receiver-can-be-a-registered-slatecast-device.md](2026-09-10-an-esphome-receiver-can-be-a-registered-slatecast-device.md).

`ditheredBy` already exists in disguise: `DITHER_ALGORITHMS` includes `off`,
documented as "skips our quantization entirely and sends the full-colour
downscaled image so the panel's own controller does the dithering". That is a
device property wearing an algorithm's clothes.

The owner, opening the thread:

> I noted it's not the screen type that matters, but the way you interact with
> it.

> Does it stream images? Again, we have ePaper displays streaming images, but
> one of our LCD panels does too as it's ESP32 and cannot run Chrome or WPE
> itself. That's important. Since it has no browser, it's just like an ePaper
> display. But the M5Paper ePaper display, I think, can stream images at 30fps
> or even 60fps. […] So it's effectively the same as a regular LCD panel.

> What we need to also use as a differentiator is the update rate of the
> screen, the rotation, the panel's native pixel layout (it can matter in some
> scenarios), if the panel dithers or not (the M5Paper does not, but all the
> Pimaroni Inky ones do), if it's Black and White, Grayscale, E6/E7 color, or
> full color, is it a circle or square/rectangle and have all the pixels? If
> not, we need to mask off the view internally, so it doesn't render into the
> parts you can't see.

Chat: T3 Code thread `a7e03562-acab-4308-ba0d-fc93531ece7f`.
