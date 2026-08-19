# The dev preview gets a router; `/d/:id` and Slatecast deliberately do not

**Status:** Accepted
**Date:** 2026-08-16
**Type:** Architecture / frontend (scope)
**Supersedes:** —
**Superseded by:** —

## Decision

`packages/web` — the Inkcast dev preview — renders a `<BrowserRouter>` with a
`<Routes>` table: one route (`/`) plus a catch-all redirect. That implements the fleet
decision `2026-08-16-owned-web-apps-use-react-router-with-path-urls` in the `agentic`
root repo, which covers single-view apps deliberately.

**`/d/:id` and `packages/slatecast` are out of scope, and that is a decision rather
than an oversight.** This repo has three browser surfaces and only one of them is a
client-routed SPA:

| Surface | What it is | Router? |
| --- | --- | --- |
| `packages/web` | the dev preview — edit a sample track, see every panel re-render | **yes**, this change |
| `/d/:id` | a page **rendered by the server**, per device | no — the server IS the router, and the URL is already a real path |
| `packages/slatecast` | the panel the `/d/:id` page boots | no — one view, and its device id comes from the rendered HTML, not the URL |

## Why the other two stay as they are

- **`/d/:id` already satisfies the fleet decision.** The point of that decision is real
  path URLs instead of `#/`, and these are real paths that reach the server, get logged,
  and can be cached per route. Adding a client router would move routing *away* from the
  server that is doing it correctly.
- **Slatecast has nowhere to navigate.** It renders one device's panel; there is no
  second view, and it never reads the URL — `state.ts` gets the id from the server-
  rendered snapshot and opens `/d/${deviceId}/ws`. A router there would be ceremony with
  a real cost, since it is Preact and would need `preact/compat` aliasing.
- `hasSpaFallback: false` on the `/assets/*` mount **stays false**, and for a reason
  worth not re-litigating: it is an asset origin. A missing chunk must be a 404, not
  HTML. It is not the "SPA fallback" the fleet decision talks about flipping.

## Evidence

> "Points-Market, Board Game Picker, and QueuePilot, Rip-Deck, CastKit, Image-Viewer,
> and the others need browser routing. I want them all the same" (owner, 2026-08-16)

Verified 2026-08-16: `yarn typecheck`, `yarn lint:biome`, `yarn lint:eslint` and 221
tests all pass. No behaviour changes — the dev preview renders exactly as before.
