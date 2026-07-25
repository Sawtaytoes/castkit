# Slatecast tests run in real Chromium, with MSW's WebSocket link as the server

- **Status:** Accepted
- **Date:** 2026-07-24
- **Type:** Testing / toolchain
- **Supersedes:** —
- **Superseded by:** —

## Decision

The `@castkit/slatecast` Vitest project runs in **browser mode against real
Chromium** (Playwright provider), not jsdom or happy-dom. Component tests use
`@testing-library/preact`; interactions use `@testing-library/user-event`.

The server side of the WebSocket is faked with **MSW's `ws.link`**
(`msw/core/ws` + `setupWorker`), not a hand-rolled `MockWebSocket` global. Tests
call the real `connect()`, which opens a real `WebSocket` that MSW intercepts,
so the snapshot/delta protocol and the command path are exercised end to end.

A second layer, **Playwright `e2e/*.spec.ts`**, drives a real browser against the
real server (`e2e/testServer.ts`) with the MQTT broker swapped for a recording
stub. `.spec.ts` is Playwright; `.test.ts(x)` is Vitest.

## Context

Slatecast had no test project at all — the other four Vitest projects are
node-only and none could even import `state.ts`, which reads the page shell at
module load.

Two sibling conventions conflicted. The `mux-magic` family (which this repo
mirrors per AGENTS.md) runs its frontend in real Chromium and has a locked
decision saying so. `bambuddy` and `spoolbuddy` — the repos that actually use
MSW — run jsdom with `@testing-library/{react,preact}` and mock WebSockets by
hand via `vi.stubGlobal("WebSocket", MockWebSocket)`.

## Why

**Real Chromium over jsdom** — beyond mirroring mux-magic, three parts of
Slatecast are untestable under jsdom:

- `SeekBar` divides by `getBoundingClientRect().width`, which is always 0 in
  jsdom → `NaN`/`Infinity`.
- `SeekBar` calls `setPointerCapture`, absent in jsdom.
- `accentColor.ts` reads canvas pixels via `getImageData`; jsdom's
  `getContext("2d")` returns null without `node-canvas`.

All three work in browser mode. The drag test confirms it: real pointer capture,
a real rect, and an exact asserted scrub position.

**MSW's `ws.link` over a hand-rolled mock** — Slatecast's transport is a
WebSocket carrying a well-defined protocol, and `ws.link` intercepts it
declaratively: push server frames, assert on client commands, no fake class to
keep in sync with the real `WebSocket` interface. Verified by spike that
WebSocket interception does **not** go through MSW's service worker, so no
`mockServiceWorker.js` is needed. **Adding HTTP handlers later would require
generating one** — Slatecast's only HTTP is `<img>` loads, so none exist today.

**A separate Playwright layer** because the component suite necessarily stubs the
server. The e2e layer covers the seam it can't: page-shell assembly, the
WebSocket upgrade, and the device→MQTT command bridge.

## Evidence

The optimistic-controls suite was validated by mutation — removing the pause
position re-stamp, confirming predictions on any frame rather than matching
ones, and dropping the volume throttle each failed exactly one test and no
others.

On the MSW question the maintainer was right and the initial reading of the
sibling repos was wrong: *"I know we use MSW on some stuff, I just don't know
where. It's definitely used by some of my apps."* A sweep found real MSW usage
in `bambuddy-src/frontend` and `spoolbuddy-src/frontend`; `mux-magic`'s copy is a
dormant harness with an empty handler array. Choosing `ws.link` follows the
maintainer's explicit instruction to use MSW here.

## What we rejected — DO NOT revert to this

- Do not add `jsdom`/`happy-dom` to `@castkit/slatecast`, or "polyfill" a rect
  or canvas to make a test pass. The three cases above are the reason.
- Do not replace `ws.link` with a hand-rolled `MockWebSocket` global "to match
  bambuddy/spoolbuddy". Those predate this and mock HTTP with MSW anyway.
- Do not delete `__resetStateForTests`. A browser's ESM registry is immutable,
  so `vi.resetModules()` returns the *same* module instance and signals leak
  between tests. This was observed, not theorised.
- Do not run the e2e specs under Vitest — `@playwright/test`'s globals are
  incompatible; the root config excludes `e2e/**` deliberately.
