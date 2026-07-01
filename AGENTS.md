# AGENTS.md

Guidelines for AI agents working on **Inkcast** — a self-hostable e-ink display
render/push platform. Server renders per-device PNGs (React → Chromium/Satori →
per-panel dither) and pushes them to dumb Pi-Zero-W fetchers; devices surface in
Home Assistant via MQTT discovery.

## ⛔ Locked decisions — read before changing behavior

[docs/decisions/](docs/decisions/README.md) is an **append-only** log of settled
decisions. Do not silently reverse or re-litigate one. To change a locked
decision, add a NEW dated file that supersedes the old one (link both ways) and
get sign-off first. Skim the [index](docs/decisions/README.md) before any
non-trivial task. Highlights:

- **Public OSS app on GitHub** (not the private Gitea). No homelab secrets in git;
  config comes from the environment.
- **Local drive + node-modules linker.** This repo lives at
  `D:\Code-Projects\Personal\inkcast`, NOT the `G:` SMB share (symlinks/PnP both
  fail over the network drive).
- **Views use inline style objects** (Satori-safe flexbox), not Emotion/Tailwind.
- **Latest dependencies**, never scaffold with old ones.

## Project

A TypeScript monorepo (Yarn 4 workspaces). The server renders a per-device HTML
view with headless Chromium (or Satori), quantizes/dithers it to the panel's
palette, and pushes it over MQTT. See
[docs/new-platform-build-handoff.md](docs/new-platform-build-handoff.md) is the
originating brief (in the `home-displays` repo); the architecture + phase plan
live there.

### Packages

| Package | Scope |
| --- | --- |
| `@inkcast/core` | Panel/palette definitions, device registry, the supersample→downscale→dither pipeline. No HTTP/engine deps. |
| `@inkcast/views` | Static React view components rendered by BOTH engines (inline styles, flexbox subset). One component per file. |
| `@inkcast/render` | Render engines: headless Chromium (Playwright) and Satori (SVG→resvg). Same view in, supersampled PNG out. |
| `@inkcast/web` *(planned)* | Vite browser dev-preview + view catalog. |
| `@inkcast/server` *(planned)* | Hono token API + MQTT publish/subscribe + idle/active state machine. |

### Bake-offs (Phase 0)

- `yarn bakeoff:render` — Decision 1: renders the now-playing card through
  Chromium AND Satori at both panels → `render-output/render/`.
- `yarn bakeoff:dither` — Decision 2: dithers card/gradient/photo with every
  algorithm × supersample factor, one contact sheet per (panel, image), mono and
  E6 separate → `render-output/dither/`.

e-ink can't be screenshotted; the sheets are the review artifact. `render-output/`
is gitignored (regenerated artifacts).

### View authoring — JSX pragma required

Every `.tsx` **view** file (in `@inkcast/views`) must start with:

```ts
/** @jsxRuntime automatic @jsxImportSource react */
```

Reason: the bake-off + render code runs under `tsx`, which transpiles files it
sees under `node_modules` (our workspace packages are symlinked there) with the
**classic** JSX runtime, ignoring the tsconfig `jsx` setting — so without the
pragma, `renderToStaticMarkup` throws `ReferenceError: React is not defined`. Vite
and Vitest don't need it (they process workspace source with automatic JSX), but
the pragma is harmless there and keeps every path consistent.

## The five most-violated code rules (from mux-magic; enforced here)

1. **No `for`/`for...of`/`while` over arrays.** Use `forEach`/`map`/`filter`/`reduce`.
2. **`const` only. No `let` mutation.**
3. **Spell every variable name out.** No single letters or abbreviations.
4. **Booleans start with `is`/`has`.**
5. **No array mutation** (`concat` over spread-push).

Plus: function destructuring for 2+ args, always-braced `if`/`else`, arrow
functions, no barrel files, JSDoc immediately above exports.

## Before every commit

- `yarn lint` — Biome (`--write --unsafe`) then ESLint (`--fix`); re-stage changed files.
- `yarn typecheck` — full monorepo type check.
- `yarn test` — Vitest unit tests.

Commit small and often; conventional commits; one logical change per commit.
**Never** push to the GitHub remote or publish without Kevin's go-ahead.

## Package manager

Always `yarn`, never `npm`/`npx`. One-off executables use `yarn dlx <pkg>`.
Add deps at latest: `yarn workspace @inkcast/<pkg> add <dep>@latest`.

## Environment / secrets

No secrets in git. The MQTT broker host/credentials, device tokens, and any HA
connection details are read from environment variables at runtime (`.env` is
gitignored). Keep the app portable so a third party can self-host.
