# Now-playing Dashboard uses one compact layout at every panel size

- **Status:** Accepted
- **Date:** 2026-07-02
- **Type:** Product behavior
- **Supersedes:** —
- **Superseded by:** —

## Decision

The Now Playing (Dashboard) view renders **one layout at all panel sizes** —
the layout previously reserved for the small pHAT: album art beside the
title/artist/album block, with the date and time together on a single footer
strip. The large-panel-specific branch (top banner row with the play-state
glyph + "Now Playing" / "Last Played" text and a corner clock) is **removed**.
There is no play/paused indicator; the big E6 panel now matches the small mono
one. All text is bold.

## Context

On the physical 800×480 E6 Impression the Dashboard rendered its large-panel
branch: a red "LAST PLAYED" banner, a corner clock, and looser type. The
maintainer found it markedly worse than the small pHAT rendering.

## Why

Maintainer preference from the real panel: the banner read as ugly clutter and
the big-panel layout didn't look as good as the small one. Collapsing to the
single compact layout removes the banner and gives one consistent look. This
does not regress [title-above-artist](2026-07-02-title-above-artist.md) — the
title is still first and largest.

## Evidence

> "the 'Last Played' part can go. Ugly. Why doesn't this look as nice as the
> smaller display? We should just match it at this point."

— maintainer, 2026-07-02 (verified via preview renders at both panel sizes)
