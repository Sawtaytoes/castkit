# Landscape photo frames can show two portraits side by side (server-composed)

- **Status:** Accepted
- **Date:** 2026-07-12
- **Type:** Product behavior
- **Supersedes:** —
- **Superseded by:** —

## Decision

A landscape image-mode panel (e.g. the 13.3" e-ink Photo Frames) can render
**two portrait photos side by side** in a single frame instead of one
letterboxed/cover-cropped photo. This is opt-in per device via a new
**"Photo Layout"** HA config entity (global default + per-device override):

- `single` (default) — the existing one-photo-per-frame behavior. Nothing
  changes for any screen until this is flipped.
- `dual-portrait` — the server picks two portrait assets, face-steers each into
  its own half-panel window (reusing `computeFaceCropRect`), and composites them
  with a thin white gutter into one panel-sized PNG.

The composition is **server-side** (Inkcast image mode): the device still just
draws one PNG. It works for any landscape image-mode panel; it is a no-op on
portrait panels.

**Fallback:** in `dual-portrait`, when two *portrait* assets aren't available
this cycle (only landscape matches, or the pool is too small), the frame falls
back to a single full-panel photo. A frame is always shown; the layout never
leaves the panel blank or half-empty.

## Context

The 13.3" frames are landscape. A portrait photo cover-cropped to landscape is a
narrow horizontal band that discards most of the image, and the face-aware crop
often letterboxes it (see
[2026-07-02-face-crop-shifts-never-zooms](2026-07-02-face-crop-shifts-never-zooms.md)).
ImmichKiosk fills a landscape screen by pairing two portraits — using the whole
panel and keeping both photos whole. CastKit's crop function already takes an
arbitrary target size, so a half-width target per photo reuses all the existing
face-steering logic; only a compositing step and a picker for two portrait
assets are new.

## Why

The maintainer wants the big landscape frames to use the whole panel for portrait
photos instead of wasting it on bars or a heavy crop — matching the ImmichKiosk
side-by-side layout — while keeping every configured face in frame.

## Evidence

> "With a horizontal screen, this ImmichKiosk app does two portrait images
> side-by-side. We should be able to update CastKit to do that right? Good for my
> big screens. … it's my 13.3" e-ink screens that I want this right now"

— maintainer, 2026-07-12
