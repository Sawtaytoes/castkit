# Duo chooses a photo before choosing its layout

Status: Accepted
Date: 2026-11-01
Type: Product behavior
Supersedes: [Landscape photo frames can show two portraits side by side](2026-07-12-dual-portrait-photo-layout.md)
Superseded by: None

## Decision

Photo Frame (Duo) first selects a photo from the full matching pool, using the
existing people, query, and recency settings. A landscape or square selection
uses the full display. A portrait selection can pair with a different portrait
on an eligible landscape panel; otherwise the selected portrait fills the panel.
Preview orientation is verified rather than trusting stored metadata. Existing
rotation, safe-area, face-aware crop, and single-photo fallback rules remain.

## Context

Selecting from a portrait-only pool on every cycle made Duo nearly always show
two photos, even when matching landscape photos were available.

## Why

Duo is a layout choice for portrait selections, not a restriction that excludes
landscape photos from the slideshow.

## Evidence

The maintainer clarified on November 1, 2026 that tall photos should be paired,
while wide photos should still appear fullscreen. Regression coverage exercises
landscape singles, distinct portrait companions, missing companions, and rotated
panels through the photo adapter and the real image-composition pipeline.
