# Watchy binary columns stay close together

**Status:** Accepted
**Date:** 2026-10-06
**Type:** Presentation / owner choice
**Supersedes:** [Clock hierarchy](2026-10-06-watchy-clock-and-points-emphasize-primary-values.md) for binary horizontal spacing
**Superseded by:** None

## Decision

Keep the binary row values, hour dots and minute dots together on the 200 × 200
face. Place row values at right edge 78, hour dots at x=100 and minute dots at
x=128, rather than 50 / 90 / 153. Keep dot radii, vertical rows, battery and next
event section as before. This is local drawing and adds no network work.

## Context

The previous columns required too much horizontal scanning to associate each
weight with its hour and minute bits. The owner requested closer columns.

## Why

A compact grid makes each row easier to read as a group while keeping each dot
separate and the next-event section available.

## Evidence

Owner asked to bring the numbers, hours and minutes closer together because they
were difficult to read quickly. The installation record keeps the private quote.
A native-size illustration is [binary clock](../images/watchy-binary-focus.png).
