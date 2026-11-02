# Dithered story snapshots require successful rasterization

Status: Accepted
Date: 2026-11-02
Type: CI
Supersedes: None
Superseded by: None

## Context

The M5Paper Clock Weather visual baseline contained a blank canvas and a font
rasterization timeout. A later capture correctly rendered the clock. The shared
Storybook capture waits for fonts and network idle, but the dithered canvas can
still be rendering or can have failed after those events.

## Decision

Capture dithered stories and the six-panel comparisons through the app's serial
capture after their expected previews finish. Reject any marked rasterization
error before writing a PNG. Keep the same story filenames and full-root capture.
The generic capture excludes those stories so it cannot publish a loading or
error state under their names.

Read the built Storybook index to select the dithered stories. A selection with
no matching stories fails explicitly. Preserve the component's visible error
message; add a machine-readable marker for the capture guard.

## Why

A completed error message is not a rendered panel. Baselines must describe the
finished pixels, and a failed render must fail capture rather than become the
next comparison reference.

## Evidence

The Clock Weather fixture's [failed baseline](../images/scoped-holds-vrt-clock-before.png)
and [completed render](../images/scoped-holds-vrt-clock-after.png) record the
diagnosed visual difference. Browser coverage checks delayed raster completion
and verifies that an error produces no baseline file in all four named windows.
