# Printer Status stacks printers top to bottom on a portrait panel

- **Status:** Accepted
- **Date:** 2026-09-28
- **Type:** View / layout
- **Supersedes:** [Printer Status gives each active printer a column](2026-09-23-printer-status-gives-each-active-printer-a-column.md), for a portrait panel only. On a landscape panel the column rule and the count-driven arrangement stand.
- **Superseded by:** —

## Decision

On a portrait panel, Printer Status places the printers one above the other,
each across the full width, instead of side by side. The count still decides
the arrangement; the orientation decides the direction printers are laid out
in.

## Context

The column rule was drawn for the 1280x720 landscape workbench panel. On the
720x1280 Pi Touch Portrait, three columns are each about 220 px wide and over
1100 px tall: the plate picture is small, most of each card is empty, and the
job name, remaining time and filament are cut short. Found in the story survey
of 2026-09-28.

## Why

- **A portrait panel's spare room is height.** Stacking gives each printer the
  full width its facts need and spends the height the columns wasted.
- **Orientation is a property the view already reads.** It is an installation
  setting ([a display is a panel model plus an installation](2026-09-13-a-display-is-a-panel-model-plus-an-installation.md)),
  so the switch keys on it, never on a device id.

## Evidence

Owner, T3 Code chat `t3code-8e3a5cfc`, 2026-09-28, answering "Printer Status on
the portrait panel puts three narrow cards side by side":

> The print status should be probably top and bottom in portrait mode.
