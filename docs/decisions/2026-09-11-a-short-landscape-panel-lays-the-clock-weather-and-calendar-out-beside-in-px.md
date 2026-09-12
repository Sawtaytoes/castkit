# A short landscape panel lays the clock, weather and calendar out beside, in px

- **Status:** Accepted
- **Date:** 2026-09-11
- **Type:** View layout
- **Supersedes:** —
- **Superseded by:** —

## Decision

On the short landscape panel — `(min-aspect-ratio: 5 / 4) and (max-height: 400px)`,
today only the 480×320 WT32 workbench panel — the three idle views stop stacking in
`vmin` and lay out **beside**, in fixed px, the way Now Playing already does there
([2026-09-10](2026-09-10-a-short-landscape-panel-lays-now-playing-out-beside-the-art.md)):

- **Clock**: a wall-calendar **date tile** at the left (`FRI` / `11` / `SEP`, a 144×196
  raised block, 24 / 90 / 24 px) and the time at the right at **110 px**, with the
  meridiem at 40 px **under the last digit**. The tile's strings are three characters
  at most, so nothing on this view is fitted. The tile keeps this shape under the
  numeric-date setting too: it is a fixed frame, not a formatted string.
- **Weather**: temperature (148 px) and condition (36 px) at the left; at the right the
  condition's **mark** (96 px) over the time (48 px), the weekday (30 px) and the
  month-day (26 px) as two lines. A four-character reading (`-12°`, `104°`) steps the
  number down to 112 px, and a condition of eleven characters or more (`Thunderstorms`,
  `Partly cloudy`) steps to 28 px, so neither leaves the glass.
- **Calendar**: one header row of 66 px — time (44 px) with its meridiem (22 px) over the
  date (22 px) at the left, the mark (54 px) with the temperature (30 px) over the
  condition (20 px) at the right — and every remaining pixel to the agenda: **five**
  rows at 22 px, not six.

The square and the porthole keep their `vmin` column and their six-row agenda: the
query cannot match them, and the before/after renders at 720×720 differ by zero pixels.

The views change their **markup** on this panel, not only their CSS: a tile, a split
meridiem and a drawn mark are things a stylesheet cannot add. `useIsShortPanel` carries
the same query as `styles.css`, and the two must stay identical.

## Context

Slatecast sizes everything in `vmin`, and `vmin` is 3.2 px on this glass against 7.2 px
on the square. Measured from the deployed CSS: the clock's date was 16 px, the weather's
date 13 px, and the Calendar's agenda rows 11 px — on a panel where 1 px is 0.156 mm,
read from a workbench. Now Playing had the same defect and was fixed the night before;
the owner asked for the other three views the next day: *"They all suffer from the
small screen issue that the other ones were suffering from until we fixed them last
night."*

Two rounds of candidates were served at true size, in Outfit, on the panel's palette:

- Round 1 ([page](../previews/2026-09-11-short-panel-clock-views-round-1.html),
  [render](../previews/2026-09-11-short-panel-clock-views-round-1.png)): the current
  CSS beside three families — **A** the same composition sized in px, **B** two
  columns like Now Playing, **C** a slim band across the top with the body to one
  subject — for each of the three views, plus every candidate again with the widest
  date the views can draw. The owner chose **B** for Clock and Weather (*"B is super
  cool! For this shape, it works!"*) and **A** for Calendar, but with its header on one
  row (*"the time should go on one side and weather/date should go on the other … don't
  do those vertically to make more space for events"*).
- Round 2 ([page](../previews/2026-09-11-short-panel-clock-views-round-2.html),
  [render](../previews/2026-09-11-short-panel-clock-views-round-2.png)): the meridiem
  under the first digit, under the last digit, or beside on the baseline; Weather B
  with the condition mark under four conditions; and two one-row Calendar headers. The
  owner chose the meridiem under the last digit (*"PM on the right for sure"*), asked for
  the date tile a step smaller and the time a step larger, and took header **H2** —
  time over date at the left, weather at the right — *"only because the date doesn't fit
  as well otherwise."*

Every candidate was checked by script for clipped, overflowed or wrapped text on
today's values and on the widest strings (`Wednesday, September 30`, `12:45 PM`), and
the check caught what the eye did not: a right-aligned column letting the date grow
past its box on the widest day.

## Why

- **Beside uses the panel's width; stacking spends its height.** The panel is 3:2 and
  short. A column that reads at 720 px tall has 320 px here; two columns give each
  fact the room a column gave it on the square.
- **px, not vmin, for the same reason as Now Playing.** The query already bounds the
  height. A panel this small has no room for proportion, and the numbers were chosen
  by eye at true size, not derived.
- **The meridiem under the last digit.** Beside on the baseline cost the time a size
  step (92 → 72 px). Under the first digit read as a stray word. Under the last digit it
  reads as a suffix.
- **Five agenda rows, not six.** Six rows at a readable size do not fit under a 66 px
  header on 320 px. The sixth row at 11 px was not being read anyway.
- **H2 over H1.** With the date under the time at the left, the widest date fits without
  truncation; H1's right-aligned column had to ellipsise it.
- **Markup, not only CSS.** Now Playing's short-panel rule was CSS alone because its
  markup already had every element. These three views need elements the square does
  not draw, and a hook that reads the same media query is the smallest honest way to
  add them.

## Evidence

- Owner, 2026-09-11, T3 Code chat `t3code/improve-rip-deck-small-screen-views`: the
  quotes above.
- Before/after at 480×320, fixture data:
  [clock before](../images/2026-09-11-short-panel-clock-before-2d-printer-workbench-480x320.png) /
  [after](../images/2026-09-11-short-panel-clock-after-2d-printer-workbench-480x320.png);
  [weather before](../images/2026-09-11-short-panel-weather-before-2d-printer-workbench-480x320.png) /
  [after](../images/2026-09-11-short-panel-weather-after-2d-printer-workbench-480x320.png);
  [calendar before](../images/2026-09-11-short-panel-calendar-before-2d-printer-workbench-480x320.png) /
  [after](../images/2026-09-11-short-panel-calendar-after-2d-printer-workbench-480x320.png).
- The square is unchanged: `png-diff` of the 720×720 story before and after this change
  reports 0 of 518,400 pixels differing for each of the three views.
- Tests: `ClockShortPanel.test.tsx`, `WeatherShortPanel.test.tsx`,
  `CalendarShortPanel.test.tsx` load the stylesheet, mount at 480×320 and at 720×720,
  and assert the placement, the sizes, the row budget, and that the square keeps its
  column. `time.test.ts` covers the split meridiem, the tile, and the two-line date.
- Measured sizes before the change: `agentic/docs/runbooks/rip-deck-wt32-display.md`.
