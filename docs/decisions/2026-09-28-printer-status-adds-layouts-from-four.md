# Printer Status adds layouts from four

- **Status:** Accepted
- **Date:** 2026-09-28
- **Type:** View / layout
- **Supersedes:** [Printer Status gives each active printer a column](2026-09-23-printer-status-gives-each-active-printer-a-column.md), for counts four and above only.
- **Superseded by:** —

## Decision

The existing one-, two- and three-printer layouts stay unchanged. Four printers
use a 2×2 grid. Each card puts the print preview on the left and the printer
facts on the right. Five or more printers use compact rows. Each row keeps the
print preview, printer state, job name, progress, finish, and Pause or Resume
and Stop controls.

The Pi Touch Display 2 landscape profile is 1280×720. At that size, control
labels stay visible. Narrow screens use control icons while keeping the labels
in the accessibility tree. The view draws only complete rows and keeps the
printer order from Home Assistant.

## Context

The first four-or-more proposal changed the two- and three-printer layouts and
did not show print previews in the compact rows. The owner approved the four-up
grid and the five-or-more layout, with a print preview and controls in every
row, while asking that the two- and three-printer layouts stay as they were.

## Why

- Four cards fit in a two-row, two-column grid with a readable image and facts.
- A row list gives five or more active printers space for the print preview and
  controls on the primary 1280×720 display.
- The 64 px row budget prevents the panel from drawing a partial card.

## Evidence

Owner, T3 Code chat `t3code-6304ba05`, 2026-09-28:

> Why are we changing the 3-print and 2-print views?

> The 4-print view and up are fine. You can implement those.

Owner, T3 Code chat `t3code-6304ba05`, 2026-09-27:

> In the 5+ view, there's room to show the image of what's printing and some
> controls. It's important to have those. They can be icons rather than only
> labels depending on screen width. Also note, this would primarily display on
> the Pi Touch Display 2 first and foremost.
