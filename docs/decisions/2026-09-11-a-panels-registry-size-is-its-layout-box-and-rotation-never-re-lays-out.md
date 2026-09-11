# A panel's registry size is its layout box, and rotation never re-lays-out a view

- **Status:** Accepted
- **Date:** 2026-09-11
- **Type:** Product behavior
- **Supersedes:** —
- **Superseded by:** —

## Decision

A device's `width` and `height` in the registry are **the framebuffer in the
orientation the device presents it**, not the glass's datasheet resolution.
Every view lays itself out in that box.

The `rotation` knob turns the **finished bitmap** to cancel out how the panel is
mounted. It does not re-run the layout. A quarter turn therefore does not give
you a landscape view of a portrait panel — it gives you the portrait view, on
its side.

So a panel that is read in landscape is registered landscape, with rotation 0 or
180. Never portrait plus a 90.

The M5Paper is registered **960x540, rotation 0**. Its glass is a 540x960
portrait panel, but its ESPHome firmware drives a 960x540 landscape canvas, and
the canvas is what the server must compose for.

Two view fixes come with this, because the same defect was on every panel:
`ClockAgendaView` and `ClockWeatherView` now run the **date** through `fitText`,
as `AgendaView` already did. The date is the widest string either view draws —
"Wednesday, September 11" beats "4:59 AM" on character count — and it was the
one string with no width fitting.

## Context

The M5Paper was registered 540x960 with `rotation: 90`. That produced a
correctly sized 960x540 PNG, so the panel filled and nothing errored. The
**content** inside it was a portrait composition tipped on its side.

The typography made that unreadable rather than merely sideways. Both clock
views size their text off `height`, which is the large axis on a portrait panel:
at 960 tall the date came out at 125px against 496px of usable width. `fitText`
rescued the time. Nothing rescued the date, so it wrapped, overflowed, and ran
off the edge.

The owner reported it as *"the calendar/time/agenda/weather views don't look
right. Even rotated, they're cut off and not rotating"* and *"unlike other
devices, this one doesn't seem to rotate properly."*

That last observation is the useful one. Every other panel in the fleet is
landscape-native and mounted landscape, so its rotation is 0 or 180 and the
knob is only ever a flip. The M5Paper is the only device that ever asked for a
quarter turn, which is why it is the only device that exposed what the knob
actually does.

## Why

The registry entry recorded a hardware fact (the glass is 540x960) where the
renderer needed a layout fact (the canvas is 960x540). Rotation was then used to
repair the output size, which it did, and to repair the composition, which it
cannot do.

Fixing it in the registry rather than in the pipeline keeps one meaning per
field. The alternative — making a quarter turn swap the layout box — was
rejected: it would silently swap the output dimensions too, and the ESPHome
`resize:` and `display: rotation:` that must match are both compile-time, so a
quarter turn still could not be a runtime knob. It would have made the knob look
honest while leaving the reflash requirement in place.

Fitting the date is separate from the orientation question and would have been
worth doing anyway. The 13.3" Impressions wrap "Friday, September 11" onto two
lines today, which also breaks the centred column.

`ClockView` is deliberately **not** changed. It has no horizontal padding and no
fitting at all, including for the time, so giving it one is a design change
rather than a repair.

## Evidence

- Owner, 2026-09-11 (chat `t3code/370769f1`): *"One other thing, the
  calendar/time/agenda/weather views don't look right. Even rotated, they're cut
  off and not rotating."* and *"Unlike other devices, this one doesn't seem to
  rotate properly."*
- Reproduced at 540x960 + rotation 90 through the Chromium engine: the frame
  matches the owner's screenshot exactly — time and date sideways, both clipped
  on the long edge.
- Re-rendered at 960x540 + rotation 0: time, date and weather upright and whole,
  and the agenda rows fit under them.
- The live panel confirmed it. `GET /api/devices/m5paper/image` returned a
  960x540 upright landscape clock after the registry change and a redeploy.
- The 13.3" wrap is real, not theoretical: `ClockAgendaView` at 1600x1200 broke
  "Friday, September 11" across two lines before the `fitText` change and holds
  one line after it.
- The firmware already said so. `device-client/esphome/m5paper.yaml`: *"The
  panel is natively 960x540 LANDSCAPE."*
