# Ambient's weather row carries the condition mark

- **Status:** Accepted
- **Date:** 2026-09-25
- **Type:** View layout
- **Supersedes:** the "No condition mark" line of [Ambient is one centered column on every panel](2026-09-25-ambient-is-one-centered-column-on-every-panel.md). The rest of that decision stands.
- **Superseded by:** —

## Decision

Ambient's weather row starts with the condition's mark, in the accent color
(`--accent-content`), before the temperature and the condition. The mark is centered on
the row, a step taller than the temperature: 10vmin on every panel, 60 px on the short
landscape panel. A condition code CastKit does not know draws no mark, and the row keeps
its text.

The widest row, `-12° Thunderstorms` with its mark, is 359 px on the short panel, inside
the 438 px a platform panel leaves and the 480 px the device page has.

## Context

The centered column was restored from the Storybook Ambient story, which carries no mark.
The owner then asked for the icons back: the two-column layout and the Calendar and
Weather faces on the short panel all draw the mark, in purple.

## Why

- **The owner asked for it.** The mark was part of what the display showed, and he noticed it gone.
- **One place for it.** Leading the row keeps the column centered and does not add a line.

## Evidence

Owner, T3 Code thread `dc89d562-8092-4862-86af-2fdc528a3504`, 2026-09-25: *"I'd like to
make sure we also get the icons back for the weather. Those were in purple I believe."*
