# A touch target's bounding box is its touch area

- **Status:** Accepted
- **Date:** 2026-09-13
- **Type:** Interaction / Layout
- **Supersedes:** — it corrects the enlarged hit areas introduced by [2026-09-11-the-artwork-is-the-transport-on-every-touch-panel-and-the-text-is-centred-on-it.md](2026-09-11-the-artwork-is-the-transport-on-every-touch-panel-and-the-text-is-centred-on-it.md), whose sizes are unchanged
- **Superseded by:** —

## Decision

**Anything carrying `data-castkit-target` must have a `getBoundingClientRect()`
equal to the area the browser will hit-test for it.** A control that draws a
bigger area for a finger grows its own box. Two ways of doing it are now banned:

1. **No `::before` / `::after` pad.** A pseudo-element is invisible to
   `getBoundingClientRect()`.
2. **No hit area that comes from an overflowing replaced part**, such as a range
   input's thumb drawn larger than the input's box.

The seek bar and the volume slider are rebuilt to that rule:

- `.seek-track.interactive` is `10vmin` tall with `padding-block: 4vmin` and an
  equal negative `margin-block`, so the box is the touch area and the row's
  layout height is still the bar's. The painted bar moved into a `.seek-bar`
  child.
- The volume slider is a `.volume-slider` box `5.5vmin` tall — the thumb's size
  — holding a painted `.volume-bar` and a transparent `input[type="range"]`
  stretched over the whole box.

`views/nowPlayingTouchTargets.test.tsx` is the enforcement: at 480×320 and
720×720 it walks every second pixel and asserts that no point the browser gives
a control falls outside that control's recorded rectangle. One pixel of slack
covers a fractional layout edge; a fourteen-pixel pad does not survive it.

## Context

The owner, 2026-09-13:

> My touch controls are working really erratically on the 480x320 display
> (optical ripper one).

The optical-ripper tower was `off` all day, so the view under his finger was Now
Playing, never Rip Deck.

The remote-display renderer does not send touches straight through. It
screenshots this SPA, sends the picture to the panel, and when the panel reports
a finger it binds that touch with two answers that must agree: what
`document.elementFromPoint` says now, and the target rectangles it recorded with
`getBoundingClientRect()` from the frame the panel is actually looking at
(`worker.py` `TARGETS_SCRIPT` and `HIT_SCRIPT`, `interaction.py` `target_at`).
Disagreement means the frame is stale, so the touch is dropped — silently, by
design.

Both sliders had been given a deliberately generous finger area, and both did it
in a way the rectangle cannot see.

## Why

**The renderer is right to check the geometry, so the geometry has to be true.**
The rectangle check is what stops a tap landing on a control that has since moved
under it. Loosening it would trade a silent dead zone for a silent wrong action,
which is worse. Declaring the pad through a custom property that `TARGETS_SCRIPT`
reads would work, but it puts the number in two places and nothing would notice
when they drift.

**The box is the one description every consumer already shares.** A real box is
true for the renderer, for a hit test, for an accessibility tree and for anyone
who inspects the element. A pad on a pseudo-element is true for exactly one of
them.

**The visible result does not change.** The short panel renders pixel-identical
before and after. The square differs by 587 of 518,400 pixels, all anti-aliasing
around the seek knob, from a 0.02 px sub-pixel shift in the knob's containing
block.

## Evidence

Measured on the deployed page (`https://castkit.octen.dev/d/slate-8f27fc`) in an
isolated 480×320 Chromium, 2026-09-13, before the fix:

| Target | Recorded box | Real touch area | Rejected |
| --- | --- | --- | --- |
| `now-playing-artwork` | 216 px tall | 216 px | 0 px |
| `now-playing-seek` | **10 px** (y 185..195) | **39 px** (y 171..209) | **28 px** |
| `now-playing-mute` | 43 px | 43 px | 0 px |
| `now-playing-volume` | **10 px** (y 284..294) | **27 px** (y 275..301) | **16 px** |

Sampling every second pixel across the whole panel, 2586 of the 16,002 sample
points that the browser gave to a control were outside that control's recorded
rectangle — every one of them on the seek bar (938) or the volume slider (1648).
That is **74 %** of the seek control's landings and **62 %** of the volume
control's, thrown away with no feedback on the glass. The thin painted line
worked; the pad around it did nothing.

The new test fails on the old markup with the expected numbers — the recorded
seek height reads 10 px against 38 on the short panel and 14.39 px against 72 on
the square — and passes on the new. Full suite: 158 tests, 20 files, all passing;
`lint` and `typecheck` clean.

The 720×720 Square runs this SPA in a real browser with no renderer in the path,
so it never lost a touch to this. It gets the honest boxes anyway, because the
rule is about the component, not about one panel.
