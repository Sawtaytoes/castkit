# Subscription details keep the overview's readable type scale

- **Status:** Accepted
- **Date:** 2026-10-27
- **Type:** Display readability
- **Supersedes:** —
- **Superseded by:** —

## Decision

Expanded AI Usage details use the overview's height-based type scale. Subscription
names, quota labels, percentages, reset times, and extra usage values stay readable
at the same viewing distance as the overview. Expansion must not make them smaller.
The actual overview scale is retained as a floor because adaptive layouts can
choose larger type than the height-based calculation on a short, wide panel.

Long reset times and metadata wrap within the panel. Smaller panels retain touch
scrolling rather than shrinking the text to fit every limit on one screen.

## Context

The in-place detail view used a 480-pixel reference height and a 1.6 scale cap,
while the overview grows from 280 pixels up to a scale of 2. On a 1024×600 display,
this made detailed limits and resets substantially smaller than the overview rail.

## Why

Details are read on the same physical display at the same distance. The larger
reading surface should keep that readability while exposing additional information.

## Evidence

Owner, 2026-10-27, chat `c04614a5-586c-460f-bbdf-b3bb9d45c4ce`, supplied
1024×600 detail and overview captures:

> Looks good. Only issue is it's very small

> Look at that text. Compare to this sizing

The in-place navigation and complete detail-data behavior remain governed by
[the subscription detail decision](2026-10-27-subscription-details-open-in-place-with-all-reported-limits.md).
