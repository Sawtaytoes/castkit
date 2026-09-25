# AI Usage is a native view on an `ai-usage.v1` channel

- **Status:** Accepted
- **Date:** 2026-09-25
- **Type:** View / data source
- **Supersedes:** —
- **Superseded by:** —

## Decision

Remaining AI subscription quota becomes a native CastKit view called
**AI Usage**, drawn from a new `ai-usage.v1` channel. It is not an external view
pointing at the AI Usage web page.

The contract carries one entry per provider and one row per quota window, with
a percentage, an optional counted amount, and a reset time in milliseconds. Two
sources fill it. The MQTT adapter accepts the producer's retained snapshot
unchanged, so an installation that already publishes it needs no new service. A
dedicated `ai-usage` adapter polls the producer's `/api/state` for an
installation with no broker. No provider credential ever reaches CastKit;
the producer holds them and CastKit reads only the normalized answer.

The view states a reset time **absolutely** unless the panel repaints fast
enough for a countdown to survive being drawn, and it budgets whole rows out of
its own panel the way the agenda view does. A provider CastKit cannot reach
keeps its row and says why.

## Context

The owner saw a third-party ePaper dashboard carrying a Claude usage widget and
asked for the same thing as a CastKit view. The household already runs AI Usage,
which collects Claude, Codex, Grok and Cursor quota, publishes a retained
`ai-usage/state` snapshot over MQTT, and serves the identical document at
`GET /api/state`.

## Why

- **The same reason Printer Status is native.** An iframe of a product's own
  page brings that page's whole layout to a panel sized for one fact, and it
  cannot be composed beside another channel. See
  [Printer Status is a CastKit view](2026-09-23-printer-status-is-a-castkit-view-fed-by-home-assistant.md).
- **A quota is the ideal ePaper value.** The producer polls no faster than every
  five minutes, so the number outlives even a 28-second repaint by the ten-times
  margin the freshness rule asks for. Every panel in the vocabulary may draw it.
- **A countdown is the one form that cannot survive.** "Resets in 3h 0m" is
  already wrong when a slow panel finishes drawing it and stays wrong until the
  next repaint, so the absolute reset time is what a slow panel gets.
- **A failed provider is the interesting case.** Dropping an unreachable
  provider makes an outage look exactly like a healthy display.

## Evidence

Owner, T3 Code chat `0df5d0af-f88b-4fb6-98ac-041d30b8ee49`, 2026-09-25:

> Having that as a CastKit view would be great! We already have an ai-usage app.

The producer's published contract, read from its own source: retained
`ai-usage/state` and `GET /api/state` both return
`{ fetched_at, poll_interval_sec, providers: [{ provider, is_ok, plan, windows: [{ id, label, percent_used, resets_at, extras }] }] }`,
with `used` / `limit` / `unit` in `extras`. The wording `$18.6 / $20` and
`7% left` matches that application's own card, so the panel and the web page
never disagree about one window.
