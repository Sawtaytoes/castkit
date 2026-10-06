# Watchy binary rows read most-significant bit first

**Status:** Accepted
**Date:** 2026-10-06
**Type:** Presentation / owner choice
**Supersedes:** [Compact binary grid](2026-10-06-watchy-binary-grid-is-compact.md), binary layout only
**Superseded by:** None

## Decision

Show hours above minutes as two horizontal rows of six circular bits. Read each
row from left to right with weights 32, 16, 8, 4, 2, 1. Label only 32, 8 and 2
above the shared columns, and use small h/m row labels. Use 9-pixel outer circles
and 8-pixel filled dots at x=40 through 165 in 25-pixel steps, y=60/95. Keep the
12-hour hour value, compact battery and separated next-event section. This adds
no network or storage work.

## Context

After confirming the compact vertical grid was easier to read, the owner chose
horizontal rows with the least-significant bit on the right.

## Why

The rows use the familiar written binary order and can carry larger circles
within the same clock area. Sparse weight labels preserve space.

## Evidence

Owner requested horizontal circles with 1 on the right and 32 on the left,
keeping only the 32, 8 and 2 labels. Private installation records preserve the
original quote. See the [native-size illustration](../images/watchy-binary-focus.png).
