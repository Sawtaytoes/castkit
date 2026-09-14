# A reflective panel's chrome is dark on paper, and the accent ink carries the emphasis

- **Status:** Accepted
- **Date:** 2026-09-14
- **Type:** Product behavior
- **Supersedes:** —
- **Superseded by:** —

## Decision

**On a panel the room lights rather than the panel lighting itself, UI chrome is
drawn dark on paper. Reversed text — paper on a filled ink background — is not
used.** This binds every view that CastKit renders for an ePaper display, not
only the one that prompted it.

**The accent ink is not decoration. It is what makes a dense text column
scannable**, and a view that drops it loses real legibility rather than only
some colour. Where a column repeats a label and a value — an event's time and
its summary — the label takes the accent and the value takes
`content.primary`.

Two consequences worth stating, because both were found the expensive way:

1. **A filled ink panel is the worst case for a reflective display**, not the
   most striking one. It covers a large area with the state the panel renders
   least well, and the text on it is then limited by the paper ink's
   reflectance rather than by the black's depth.
2. **Reversing a surface silently destroys the accent.** On paper the accent
   resolves to `intent.accent.solid`. On a filled ink surface there is no
   accent that is both legible and distinct, so the natural fallback is
   `surface.base` — the same value the body text takes. The label and the value
   collapse to one colour and the column stops being scannable. Do not "fix"
   this by picking another ink; the surface is the thing that is wrong.

**This does NOT contradict
[2026-09-09-a-browser-panel-defaults-to-dark-and-is-read-from-across-the-room.md](2026-09-09-a-browser-panel-defaults-to-dark-and-is-read-from-across-the-room.md).**
That record is about a **browser-mode** display, which emits its own light, and
Dark is correct there. The two rules disagree only if the axis is read as taste.
It is not taste; it is whether the display emits or reflects.

⚠️ **The property this keys on is not one of the nine.** `size`, `rotation`,
`shape`, `pixelGrid`, `colour`, `ditheredBy`, `repaint`, `input` and `delivery`
([property table](2026-09-13-a-display-is-a-set-of-properties-and-panel-technology-is-not-one-of-them.md))
do not express emitted against reflected light. `delivery` is the near miss and
is wrong: an ESP32 colour LCD is fed finished frames and still emits its own
light. Naming the real property is left open deliberately rather than
overloading an existing one, and this record should be revisited when it is
named. Until then the rule is stated in terms of what the display does with
light, which is the thing that is actually true.

## Context

A photo-beside-agenda layout was drawn, built for the real Kitchen Counter panel
(800 x 480 Spectra 6) and published to it twice: once with a paper rail and the
accent blue on the event times, once with an ink rail and reversed text. Same
photo, same calendar, same split — the background was the only variable. The
owner read both on the glass.

The measured difference is in the palette rather than in taste. Spectra 6's
paper is `#D0D2D2`, not `#FFFFFF`: it is a reflector at roughly two thirds of
white, so a paper-on-ink pairing starts from a dimmer light value than an
ink-on-paper one does, and it gets no help from a backlight because there is
none.

## Why

The owner's own words, and he generalised it himself rather than being asked to:
the panels are optimised for black on white. That matches how a reflective
display works, so the rule is recorded at the level he stated it, not narrowed
to the one view that produced it.

The accent half of the rule comes from the same comparison. He called the blue
out unprompted as the thing that helped, which is a stronger signal than a
preference between two backgrounds: it says the colour is carrying information,
not style.

## Evidence

> "Paper is very readable!"

— owner, 2026-09-14, on the paper rail

> "Because it's only white on black, the ink one is much harder to read. In
> general, I think these ePaper displays are optimised for black on white.
> Adding that bit of blue helped a lot! Let's go with paper, not ink and
> document these decisions"

— owner, 2026-09-14, after reading both on the panel

Both frames were confirmed drawn on the glass, not merely published: the Kitchen
receiver logged `[draw] 542699B pushed in 28.9s` for the paper frame and
`[draw] 539968B pushed in 27.5s` for the ink one, each matching the published
frame byte for byte.
