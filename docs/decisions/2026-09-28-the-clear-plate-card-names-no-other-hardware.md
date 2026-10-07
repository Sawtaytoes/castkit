# The Clear plate card names no other hardware

- **Status:** Accepted
- **Date:** 2026-09-28
- **Type:** UI copy / product
- **Supersedes:** in part — [A finished print stays on the glass until the plate is cleared](2026-09-28-a-finished-print-stays-on-the-glass-until-the-plate-is-cleared.md) (the `Or press the andon button on the printer.` sentence only)
- **Superseded by:** —

## Decision

A `finished` or `failed` card on Printer Status shows the full-width **`Clear
plate`** button and nothing under it. No sentence names an andon button, a
physical button, or any other way to clear the plate. The `.printer-clear-hint`
element and its styles are removed. Everything else in the earlier record stands:
the card stays until the plate is cleared, the tap is one tap with no
confirmation, and the card leaves when the job leaves the payload.

## Context

The first build of the card put `Or press the andon button on the printer.`
under the button, on the theory that the screen should say the printer's own
button does the same job. The owner rejected it the same day.

## Why

- Whoever is close enough to read the button will tap the button. A sentence
  offering a second route to the same result is text with no reader.
- An andon module is one household's hardware. CastKit's views are published,
  and a card that names hardware most installs do not have is wrong on every
  panel but one.
- A shorter card is the point of the card: the reminder is the shape, and one
  control is the whole of it.

## Evidence

Owner, 2026-09-28 (chat `a86efc56-0324-449a-bdf7-b936102abb20`): "The 'Clear
Plate' button is nice, but the text about the andon button is not. It is
completely useless. If I can read the 'clear plate' on the screen, I won't be
clicking the andon module. I'll probably just click the screen. Also, andon
modules are specific to my setup. That's not universal."
