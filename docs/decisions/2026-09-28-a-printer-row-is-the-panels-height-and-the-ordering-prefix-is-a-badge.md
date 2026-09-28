# A printer row is the panel's height, and the ordering prefix is a badge

- **Status:** Accepted
- **Date:** 2026-09-28
- **Type:** UI layout / data shaping
- **Supersedes:** —
- **Superseded by:** —

## Decision

Two rules for the platform Printer Status panel.

1. **The card row is the panel's height, never the tallest picture's.**
   `.platform-printers` sets `grid-auto-rows: minmax(0, 1fr)` and
   `min-block-size: 0`; a card's picture (`.platform-printer-image`, inside
   `.platform-camera` or not) is `min-block-size: 0; max-block-size: 100%`.
   The picture shrinks to whatever the facts leave, and the facts are never
   under the fold. A card that has no room for a picture draws no picture; it
   never scrolls the panel.
2. **A source's ordering prefix is not the printer's name.** The Bambuddy
   source strips `^\d+\s*[-–·:]\s*` from `status.name` (`2 - Foopie` becomes
   `Foopie`). The card draws its own position badge (`.printer-index`, the same
   indigo square the Rip Deck bay uses) beside the name, so the panel still reads
   in the source's order.

## Context

The owner opened the 3D Printers view in a browser at about 1400x800 and got
three cards whose covers pushed the layer, filament and button rows under the
bottom edge. The same view in Storybook showed one printer with a numbered
badge, which he liked. His Bambuddy printers are named `1 - Magi`, `2 - Foopie`,
`3 - Quadrahedron` so Bambuddy lists them in order, and that prefix was
reaching the panel's `<h2>`.

The overflow came from #114: the card became a grid with the picture on row 1
at its natural height, and the row list stretched to the tallest card rather
than the panel. The 1280x720 workbench panel never showed it because the single
column there is portrait-stacked ([record](2026-09-28-printer-status-stacks-printers-top-to-bottom-on-a-portrait-panel.md)).

## Why

- A panel is a fixed pane of glass. A card that scrolls the panel hides the
  facts the panel exists to show, and there is no scrollbar on a kiosk.
- The number is an artifact of how Bambuddy sorts. Showing it as a badge keeps
  the order visible without making it part of the name, and the badge matches
  the Rip Deck bay's, so the two views read the same.
- The strip is done in the source, not the card: the name reaches every
  consumer (title bars, spoken announcements, Home Assistant entity names)
  already clean, and a source that has no such prefix is untouched.

## Evidence

Owner, 2026-09-28 (this chat): *"It doesn't fit in my screen, and the printer
names include the numbers + hyphen which are there only to order them properly.
On Storybook, I see the printer numbers in a nice box."*

`docs/images/platform-printers-fit-before.png` (one column, `main`) against
`platform-printers-fit-after.png` and `platform-printers-three-after.png` (three
cards, 1400x640, no overflow). Story `PrintersThree` in
`packages/slatecast/src/platform/Platform.stories.tsx`; server test
`bambuddy.test.ts` (`"2 - Foopie"` → `"Foopie"`).
