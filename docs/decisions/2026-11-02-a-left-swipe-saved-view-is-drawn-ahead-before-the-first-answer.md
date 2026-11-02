# A left-swipe saved view is drawn ahead before the first answer

Status: Accepted
Date: 2026-11-02
Type: Performance
Supersedes: None (extends [2026-10-26: A swipe destination is drawn ahead and held on the panel](2026-10-26-a-swipe-destination-is-drawn-ahead-and-held-on-the-panel.md))
Superseded by: None

## Decision

When a panel's left swipe asks for a view the house resolves, CastKit draws it
ahead for the target the house last chose for that panel. If CastKit has not
learned that target yet, and the requested ID names a saved view, CastKit draws
that saved view ahead. A learned target always takes precedence.

## Context

CastKit learns a left-swipe target from the house's reply that carries the
panel's navigation ID. The learned targets are kept in memory only. After every
CastKit restart, including each deployment, no Presto had Tally Marks drawn
ahead. The first left swipe on each panel waited for the panel's browser and
showed "Opening Points…". Before the room controllers echoed navigation IDs, no
swipe ever taught CastKit the target, so every Points swipe waited this way.

The room displays now request saved view `kids-points`, and the house answers
with that same view.

## Why

The owner requires every swipe destination to be ready at release. A request
that names a saved view is the best prediction before the first answer. If the
house answers with another target, CastKit learns it from that reply and draws
the learned target from then on.

## Evidence

- 2026-11-02 Guest Bedroom worker log: `release view=kids-points path=none (no frame drawn ahead)`, followed by `page unsettled for 3.0 s, sending it: marker=navigation-feedback`.
- After a correlated reply: `stream frame ahead slate-1b32f0 kids-points (423 ms, 23314 bytes)`.
- Owner, 2026-10-26: every swipe destination should be pre-rendered and cached so a swipe never shows a loading state.
