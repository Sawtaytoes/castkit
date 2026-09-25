# The AI Usage view shows one weekly limit per provider and escalates the rest

- **Status:** Accepted
- **Date:** 2026-09-25
- **Type:** View behavior
- **Supersedes:** —
- **Superseded by:** —

## Decision

The AI Usage view draws **one row per provider**: that provider's weekly limit.
Every other window of that provider is withheld until it reaches the panel's
`alertPercent` threshold, which defaults to **80**. A window at or past the
threshold earns a second row, marked as the exception it is.

The headline is the **longest window that is not longer than a week**. When a
provider has no window inside a week, its shortest window leads instead. Ties
keep the producer's order.

The span is read from a new optional `periodHours` on the window contract, never
from `resetsAtMs`. The source infers it from the producer's own wording and
leaves a window it cannot classify unclassified.

Three supporting rules:

1. A limit the rule withheld is **never counted** in the "N more limits" line.
   That line reports only rows the panel had no room for.
2. An escalated row is marked with a rule down its leading edge and a heavier
   label. It is never marked with color alone.
3. On a monochrome panel every bar fill is the body ink, whatever the intent.

## Context

The first version of the view drew every window of every provider. On the
owner's live snapshot that is nine rows across five providers: a five-hour
session limit, two weekly limits and a model-scoped weekly limit for Claude
alone. Most of them are quiet most of the time.

The owner asked for the weekly number, with the short window surfaced only when
it is high:

> For all of these models, I only need to know the weekly usage, but it might
> be nice to also show the 5h limit if it's over 80 or something.

`resetsAtMs` looked like a cheap way to rank the windows and is not one. It is
the next clearing time, not the span. A five-hour window one minute after a
reset clears further out than a weekly window on its last day, so ordering by
reset time puts the session limit at the top roughly half the time.

The monochrome bar rule came out of the preview renders. The accent-blue fill
quantizes to a half-tone hatch on a 1-bit palette while the danger-red fill
quantizes to solid black. Claude at 72 percent and Codex 2 at 100 percent came
back looking like two different kinds of measurement on the same panel.

## Why

A panel is read from across a desk in one glance. Nine rows is a table, and a
table is read by scanning, which is a thing a person does at a keyboard and not
at a wall. One number per provider is a glance. The escalation is what keeps
that from hiding the one fact that would change what the reader does next.

Withholding a limit and dropping a limit are different events and must not share
a counter. "2 more limits" on a panel that deliberately withheld two quiet
windows tells the reader to go looking for something the view already judged
unimportant.

## Evidence

Owner, 2026-09-25, in the CastKit AI Usage thread:

> For all of these models, I only need to know the weekly usage, but it might
> be nice to also show the 5h limit if it's over 80 or something. Have some way
> to display that.

Verified against the live snapshot read from AI Usage at 22:17 UTC the same
day. Five providers, nine windows, reduced to five rows — Claude's weekly at 72
percent, Codex at 63, Codex 2 at 100, Grok at 3, Cursor at 0. Claude's
five-hour limit sat at 26 percent and was correctly withheld.

Measured on the rendered panels: the 1360 x 480 monochrome render contains
exactly two colors, and the bar fills are solid ink at every intent.

Tests: `packages/slatecast/src/platform/aiUsageRows.test.ts` covers the
selection rule, `AiUsageView.test.tsx` covers the drawn result, and
`packages/server/src/platform/sources/aiUsage.test.ts` covers the span
inference.
