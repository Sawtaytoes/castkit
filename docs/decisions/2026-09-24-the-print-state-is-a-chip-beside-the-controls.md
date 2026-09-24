# The print state is a chip beside the controls, and the band carries only the percentage

- **Status:** Accepted
- **Date:** 2026-09-24
- **Type:** View / layout
- **Supersedes:** [Printer Status gives each active printer a column](2026-09-23-printer-status-gives-each-active-printer-a-column.md), for the contents of the progress band only. The column rule, the count-driven arrangement, the unboxed plate picture and the job-name control all stand.
- **Superseded by:** —

## Decision

The progress band carries the **percentage and nothing else**. The number is
centered in the band and set against the right edge.

The state word — `Printing`, `Paused`, `Preparing` — is a **chip in the card's
head, immediately left of the Pause and Stop buttons**, with a dot before it.

The chip takes its color from the card's `data-intent`, not from the state name.
The neutral case is the accent rather than a gray.

This **reverses the band alignment the owner asked for on 2026-09-23**, which was
built and shipped: the percentage vertically centered with the state word on its
baseline. He rejected the result on the glass. The word is not realigned inside
the band; it leaves the band.

## Context

The first build put the state at the left of the band and the percentage at the
right, with the word on the number's baseline. That is the shared progress-card
shape and it is what the owner asked for.

On the deployed panel it did not work. At 15 px against a 48 px number the
baseline drops the word almost to the floor of the band, and the band is 580 px
wide, so the two ends are separated by a large empty gap.

Six options were served at 1 : 1 — the size the panel really is — with a tick
marking the band's true middle. Three moved the word inside the band; three
attacked the empty gap instead. The owner picked the one that takes the word out
of the band, and moved it from the printer's name to the buttons.

## Why

- **The state is a fact about the PRINTER, not about the progress.** The band
  answers "how far along"; the word answers "is it running". Putting the word
  with the name and the controls that change it groups the question with its
  answer: `Paused` sits next to `Resume`.
- **The empty middle was the real defect, not the alignment.** Centering the
  word fixes where it sits and leaves the gap. Removing it empties the band down
  to one number, which is what a person reads from across the room.
- **Beside the buttons rather than under the name.** Under the name, the chip
  shares a line with the nozzle text and shifts it sideways, so the meta line
  starts in a different place on every card. Against the buttons it lands on a
  fixed right-hand group and the head reads the same on every card.
- **The dot carries the state without reading.** Color alone is never the
  signal — the word is always present — but the dot lets the state register
  before the word is read.
- **Intent, not state name.** A fourth state would otherwise need a fourth rule
  and a fourth color decision. `data-intent` already exists and already tints
  the card.

## Evidence

Owner, T3 Code chat `t3code-737280df`, 2026-09-24:

> Can I see what it'd look like if the Paused/Printing status text were
> vertically centered? It looks really weird at such as small size aligned
> somewhat to the bottom

Then, after the six options were served:

> I agree with F, but I think it should to to the left of the buttons. That'll
> make it easier to identify and not all janky rendering.

Verified in `Views/Printer Status` at the `Pi Touch 2 (1280x720 landscape,
touch)` profile: the chip renders left of Pause and Stop at one, two and three
printers, and carries the warning tint on a paused card and the danger tint on a
card reporting a problem. `PrinterStatus.test.tsx` asserts the placement
structurally — the chip is a child of `.printer-head`, its next sibling is
`.printer-actions`, and the band's text is the percentage alone — so a later
refactor that puts the word back in the band fails the suite rather than the
review.
