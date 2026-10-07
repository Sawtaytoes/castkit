# Rip slots and return navigation fit small panels

- **Status:** Accepted
- **Date:** 2026-10-03
- **Type:** Display content priority and navigation
- **Supersedes:** —
- **Superseded by:** —

## Decision

Rip views identify a drive by its physical slot number, without a hardware name
or leading zeros. The source adapter carries the slot separately from its label;
older channels can retain a numbered label as a compatibility fallback. A slot
keeps its number when idle bays are filtered out.

Every rip detail view keeps Back in its header, within the allocated panel.
Details and available actions use the space below it. Unavailable tray actions
and the explanatory tray-controls sentence do not consume the small panel.
Offered actions remain subject to management authorization, and cancelling a
rip still requires confirmation bound to that job.

## Context

Long padded hardware labels crowded out the film and overlapped progress in a
compact composition. Opening a rip then placed Back below disabled controls,
outside the visible panel, so there was no usable return to the overview.

## Why

The slot locates the drive. The title, phase, progress and remaining time describe
the rip. A detail view must always have a usable return path, even when lengthy
real error details need to scroll inside the panel.

## Evidence

User: “I clicked one of the disc rips, and now it's stuck in that view with no way
to go back.”

User: “I don't need to know the drive name. Just the slot number is fine, and 3
and 4 are fine, not 03 and 04.”

Chat: `6b590b55-d1a5-427b-9c49-50c40c8bfc76`.

Chromium regressions cover a 280 × 280 panel within a larger composition, Back's
bounds and round-trip navigation, readable slot/title/progress, and stable
unpadded slots on older channels. Source tests preserve physical slot metadata.
