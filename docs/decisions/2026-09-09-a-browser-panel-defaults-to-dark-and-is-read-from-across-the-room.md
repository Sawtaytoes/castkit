# A browser panel defaults to Dark, and is typeset to be read from across the room

- **Status:** Accepted
- **Date:** 2026-09-09
- **Type:** Product behavior
- **Supersedes:** —
- **Superseded by:** —

## Decision

A browser-mode device's default `theme` is **`Dark`**, not `Auto`, on both the
server store and the client fallback. `Auto` stays a selectable option, and a
retained per-device setting still wins over the default.

Slatecast is typeset for an **appliance read at distance**, not a page read at
arm's length. Two rules follow:

1. **Secondary lines carry `font-weight: 600`**, never the default 400. Not
   500: the `system-ui` family these panels resolve ships no medium face, so a
   500 renders identically to a 400.
2. **Accent-coloured TEXT reads `--accent-content`**, an alias of
   `--color-intent-accent-content`. `--accent` is the accent *solid*, meant to
   be painted behind white. It is not a text colour on a dark surface.
   `--accent-content` is deliberately a second alias rather than a redefinition
   of `--accent`, because `NowPlaying` overrides `--accent` inline with a colour
   sampled from the album art.

`Calendar`'s header stacks the clock over the date, the way `Ambient` already
did.

## Context

The HyperPixel Square moved to the basement 3D printers workbench and idled on
`Calendar`. It painted a near-white panel, all night, in a room whose lights
were off.

Nothing was misconfigured. `Auto` resolves the scheme from the display's own
operating-system colour preference. A kiosk Pi runs Chromium with no profile
anybody has ever opened, so that preference is the stock light, forever. `Auto`
therefore is not "follow the room" on this class of device — it is a permanent
`Light` wearing a name that suggests otherwise. The house's other browser panel
had been switched to `Dark` by hand months earlier, which is the same finding
recorded as configuration drift instead of a default.

Distance was the second half of the same report. The panel sits on a workbench
and is read from across a basement, and every secondary line was regular
weight. Three specific faults measured out:

| Element | Before | After |
| --- | --- | --- |
| `Calendar` clock + date | Baseline row, 669px of content in a 648px box, so the date wrapped and stranded the day number | Stacked, no wrap, clock 10vmin → 13vmin |
| Secondary lines | `font-weight` 400 | `font-weight` 600 |
| Agenda row time | `--accent` as type: **2.87:1** | `--accent-content`: **7.79:1** |

Every text element on `Calendar` now measures above 6.7:1 in both schemes.

## Why

- **A default should be right for the device the software is for.** Every
  browser-mode CastKit device is a panel fixed to a wall or a bench. None of
  them has a user who will open display settings and choose a colour scheme.
  A default that delegates to a setting nobody will ever make is not a default,
  it is an accident with a plausible name.
- **A bright panel in a dark room is a real cost, not a taste.** The owner's
  reason for the backlight rule on this display was lamp wear. The same panel
  holding a white field at full backlight all evening is the same cost.
- **600 and not 500, because the device was measured.** On the panel, a 100px
  string measures 754.61px at weight 400 **and at weight 500**, and 776.50px at
  600. A 500 would have been a change nobody could see, shipped and believed.
  The available steps on this family are 400, 600/700, and 800.
- **A solid and an on-surface content colour are different tokens.** Reading a
  fill token as type is how the agenda row ended up at 2.87:1 — under the 4.5:1
  floor, on the one number an agenda exists to show, on the view the panel idles
  on all day.
- **`Ambient` had already solved the header.** The wrap was `Calendar` being the
  outlier, not a new layout problem.

## Evidence

> "Don't use white for the screen background. It should be in dark mode because
> it's very bright with that white, and it's hard to see from far away because
> the fonts are thin. Dark mode makes it easier to read from afar like a
> thermostat."

— maintainer, basement display move chat, 2026-09-09.

Font-weight measurement, taken over CDP against the live panel's own Chromium,
`system-ui` at 100px:

| Weight | Measured width |
| --- | --- |
| 400 | 754.61px |
| 500 | 754.61px |
| 600 | 776.50px |
| 700 | 776.50px |
| 800 | 797.70px |

Related: [the `Calendar` view carries weather](2026-09-09-the-slatecast-calendar-view-carries-weather.md).
