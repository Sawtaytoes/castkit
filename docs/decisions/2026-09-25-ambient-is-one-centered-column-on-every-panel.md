# Ambient is one centered column on every panel

- **Status:** Accepted
- **Date:** 2026-09-25
- **Type:** View layout
- **Supersedes:** the two-column Ambient layout for the short landscape panel added in [#40](https://github.com/Sawtaytoes/castkit/pull/40) on 2026-09-12. That change had no decision record of its own; it extended [the 2026-09-11 short-panel layouts](2026-09-11-a-short-landscape-panel-lays-the-clock-weather-and-calendar-out-beside-in-px.md) to Ambient by analogy, without a preview for the owner. The 2026-09-11 decision itself (Clock, Weather, Calendar) is unchanged.
- **Superseded by:** —

## Decision

Ambient draws one centered column on every panel: the time with its meridiem on one
line, the date on one line beneath it, and the temperature beside the condition on one
row below that. No condition mark.

On the short landscape panel (`(min-aspect-ratio: 5 / 4) and (max-height: 400px)`) the
column keeps the `vmin` proportions — time 17, date 5, temperature 8, condition 5 — and
is sized in px: **104 / 30 / 49 / 30**. Those are the largest sizes at which the widest
strings (`12:45 PM`, `Wednesday, September 30`, `-12° Thunderstorms`) fit a platform
panel's 438 px content box in Outfit, measured, not derived.

A physical display showing a single Clock, Ambient or Calendar view draws it edge to
edge on the page color. The platform's card frame belongs to compositions.

## Context

The Optical Ripper Tower display moved onto a platform screen on 2026-09-25 and lost its
tuned clock faces ([#96](https://github.com/Sawtaytoes/castkit/pull/96) restored them).
The restored Ambient was the 2026-09-12 two-column layout. The owner answered with the
Storybook Ambient story — the centered column — as the target, and a photo of the glass
showing the generic platform clock as the defect.

The centered column in `vmin` is not the answer on its own: `vmin` is 3.2 px on 480x320
glass, which is the 16 px date the 2026-09-11 change existed to fix. So the composition
is the owner's and the px sizing is the 2026-09-11 rule.

## Why

- **The owner chose it.** The two-column Ambient was an agent's extrapolation that was
  never shown to him.
- **One view, one composition.** A view that looks the same on the square and on the
  short panel is the one-vocabulary rule of 2026-09-12; only the unit changes.
- **Edge to edge is what the glass had.** The card frame spent 26 px of a 480 px width
  and made the display read as a different app.

## Evidence

Owner, T3 Code thread `dc89d562-8092-4862-86af-2fdc528a3504`, 2026-09-25, with a photo of
the glass: *"This doesn't match the UI we had in CastKit before you redid everything and
brought over the Home Assistant stuff."* Then *"That means we had MAJOR regressions."*
Then, with a screenshot of the centered Storybook Ambient: *"It should look like this"*.
