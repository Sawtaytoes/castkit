# Subscription details share the overview's dynamic sizing

- **Status:** Accepted
- **Date:** 2026-10-28
- **Type:** Display consistency
- **Supersedes:** —
- **Superseded by:** —

## Decision

AI Usage and the opened subscription use shared typography and progress-bar
metrics, scaled to the available panel. Quota labels in the detail view use the
overview subscription heading's size and weight. Percentages, bars, reset times,
and supporting values continue to use the same shared styles in both views.

Retain the actual overview scale as a readability floor when expanding. Keep
wrapping and scrolling when the available space cannot show every reported limit.
The overview's row selection and layout budget remain unchanged.

The owner chose the larger B mockup as a visual direction and clarified that the
implementation must follow the existing dynamic sizing, rather than fixed mockup
pixel values. The [comparison](../previews/2026-10-28-ai-usage-detail-sizing.html)
records the options; its numbers describe that static preview.

## Context

The preceding [readability change](2026-10-27-subscription-details-keep-the-overviews-readable-type-scale.md)
preserved the overview scale. Detail quota labels still used a smaller regular
style than the overview's subscription heading. Bars and supporting values already
shared their underlying styles.

## Why

Opening a subscription should preserve the overview's visual hierarchy and adapt
to the display, without introducing another fixed size preset or changing which
overview rows fit.

## Evidence

Owner, chat `c04614a5-586c-460f-bbdf-b3bb9d45c4ce`, confirmed the concern applies
to the current display and selected “B — Larger text and bars,” with this
clarification:

> Sorry, not just B. Whatever fits and matches. We do dynamic sizing, so basically,
> whatever sizing we use on the AI Usage, use when clicking the single AI Usage entry

The real-server regression compares rendered label size and weight, percentage,
bar height and resets against the actual overview, including while the opened
subscription resizes through the four named windows and a short display canvas.
