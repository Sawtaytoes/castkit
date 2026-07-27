# The Photo Frame people filter combines by a "minimum matches" threshold, not an AND/OR toggle

- **Status:** Accepted
- **Date:** 2026-07-26
- **Type:** Product behavior
- **Supersedes:** —
- **Superseded by:** —

## Decision

`Photo Frame: People` stays a plain comma-separated name list. How those names
combine is a second knob, **`Photo Frame: People minimum`** — a `number` entity
(per device, plus a global default on the Inkcast Server device, `0` = inherit)
meaning *"an asset must contain at least this many of the listed people."*

With `Ada, Grace, Alan`:

| Minimum | Behavior |
| --- | --- |
| `1` | any of the three — the behavior before this knob, and the default |
| `2` | at least two of the three |
| `3` | all three |

One integer therefore expresses any-of, all-of, and every "K of N" in between,
and it keeps meaning something sensible when a name is added or removed. An
`Any`/`All` select could not express "at least 2", and a fixed-option select
(`At least 3`) goes stale the moment the name count changes.

**A threshold that matches nothing falls back to the any-of union** and logs a
warning. An over-strict setting — or one left at 3 after dropping to two names —
must not put the frame back on the empty-filter placeholder, which is the
failure this same release is fixing
([seed decision](2026-07-26-photo-people-seeds-from-the-device-registry.md)).

Browser-mode (Slatecast) photo frames do **not** expose this knob yet; they run
at the default of 1. That matches how the recency half-life is already handled
there (a constant, not a knob) — browser mode carries a deliberate subset.

## Context

Immich's search endpoints **AND**-match `personIds`: one request listing three
people returns only assets containing all three. CastKit has always wanted
"any of the kids", so it works around that by issuing **one search per person**
and unioning the results client-side (`immichClient.ts`, `buildSearchPlan`).

That workaround is what makes the threshold nearly free. The union already
knows which of the per-person searches each asset came back from, so the count
of matched people is just how many of those result sets contain it. Filtering
on that count needs no extra Immich requests.

The pool is built and cached (6h TTL) as the **full union**; the threshold is
applied at read time. Changing the minimum therefore re-filters in memory
instead of costing a re-fetch.

## Why

The maintainer, after being told the list was OR:

> "Right now, I put `Xander, Darius, Marcus`. How can I only find pictures with
> all 3 or at least 2 of the 3 or some combination like that?"

"Some combination like that" is the requirement: not a binary, a threshold.

## Evidence

> "I'm also curious about how we put names in there. Is it always `OR` or is
> there an `AND` mode somehow? … How can I only find pictures with all 3 or at
> least 2 of the 3 or some combination like that? It'd be good for us to add
> that to this."
>
> — maintainer, 2026-07-26

Presented as a choice between a number threshold, an `Any`/`All`/`At least N`
select, and prefix syntax inside the people text itself; the maintainer chose
the number, and chose the fall-back-to-any-of behavior over showing the
placeholder when a threshold matches nothing.
