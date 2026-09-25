# AGENTS.md

Guidelines for AI agents working on **CastKit** — a self-hostable home display
platform. **One app, one view vocabulary.** A display's output depends on that
display's **properties**: color depth, dithering pattern, size, orientation,
touch, and whether it renders live (`browser` — a kiosk browser loads `/d/<id>`
and a tiny Preact SPA renders over one WebSocket) or is sent finished images
(`image` — the server renders per-device PNGs, React → Chromium/Satori →
per-panel dither, pushed over MQTT). All displays surface in Home Assistant via
MQTT discovery; HA switches views and executes device commands — the
CastKit source adapters normalize MQTT or direct API data into named channels;
see the [display platform decision](docs/decisions/2026-09-25-named-channels-and-extensions-drive-reusable-views.md).
Existing device MQTT contracts remain supported.

> ⛔ **"Inkcast" and "Slatecast" are RETIRED product names, and panel type is
> never the axis.** Do not divide a view, a layout, a test or a Storybook by
> "the ePaper one" against "the touch one" — an ePaper panel can have touch and a
> touch panel can be sent finished images. Ask which **property** the difference
> keys on and name that. The names still appear in live identifiers (package
> names, the `inkcast/` topic base, `INKCAST_*` env vars); those are scheduled
> last, not kept
> ([decision](docs/decisions/2026-09-12-castkit-is-one-app-with-one-view-vocabulary-not-inkcast-plus-slatecast.md),
> [plan](docs/2026-09-12-unify-one-view-vocabulary-plan.md)).
>
> **A display is a PANEL MODEL plus an INSTALLATION.** Panel facts, fixed by the
> hardware: `nativeSize`, `pixelGrid`, `color`, `hasPanelDithering`, `repaint`,
> `input`, `shape`, `delivery`, `hasBattery`. Installation settings, chosen per
> unit: `orientation`, `power`, `margins`, `crop`, `mask`. **Telemetry is a
> third kind and is not a property** — `batteryVolts`, `batteryPercent`,
> `isOnBattery` are written by the device, not by a person
> ([battery](docs/decisions/2026-09-13-a-battery-is-a-panel-fact-a-power-source-is-an-installation-and-charge-is-telemetry.md)). Two M5Papers are one model and two
> installations — one may hang portrait and one landscape, and nothing about the
> glass changed. None of the panel facts implies another: the M5Paper is ePaper
> with touch and a fast repaint, the WT32-SC01 is a color LCD fed finished
> frames because an ESP32 runs no browser. A view declares the properties it
> needs and never a device id
> ([rule](docs/decisions/2026-09-13-a-display-is-a-panel-model-plus-an-installation.md)).
>
> ⛔ **Every property value states what it CHANGES, and the reference is
> [docs/display-properties.md](docs/display-properties.md).** Adding a value
> without its consequence row is an incomplete change. The load-bearing one is
> the **freshness rule**: a view may show a value only if the value will still
> be true when the panel finishes drawing it — show it when its lifetime is at
> least **ten times** the repaint time. `repaint` is graded `instant` / `fast` /
> `slow` / `super-slow`, and the last two are not a matter of degree: a 3-second
> Inky pHAT can carry a clock, a 28-second Impression cannot, because the next
> minute arrives while it is still drawing the last one. Where a view can state
> a fact two ways, a slow panel gets the **absolute** form — "Next song at
> 9:42", never "3:21 remaining".
>
> ⛔ **`power: battery` drops a display one repaint grade.** Every repaint costs
> charge, so the budget becomes repaints per day. The M5Paper is `repaint: fast`
> and may carry a clock on mains; unplugged it is treated as `slow` and the
> clock comes off. ⚠️ **On ePaper a flat battery does not look flat** — the glass
> holds its last frame at zero power, so a dead panel shows yesterday's agenda
> and reads as a working display. Below the low threshold a battery install
> paints one "battery empty" notice and stops.
>
> **Dithering is three questions.** CastKit dithers only when the content
> carries color or tone, AND `color` is not `full`, AND `hasPanelDithering` is
> `false`. Pure black-and-white content needs no dithering on any panel, ever,
> and a panel whose own controller dithers (every Inky) gets the full-color
> downscale untouched.
>
> ⛔ **CastKit stamps those properties onto `:root`, and CSS keys on the stamp.**
> `@media` is for what a document truly knows — its own size, aspect ratio and
> the user preferences. `(update: …)`, `(monochrome)`, `(color)`, `(pointer: …)`
> and `(hover: …)` are **banned**: the image half renders in server-side
> Chromium, which answers all four wrongly for every ePaper panel we own, and
> Chromium's `Emulation.setEmulatedMedia` accepts a correction and silently
> ignores it
> ([decision](docs/decisions/2026-09-13-castkit-stamps-a-panels-properties-and-a-view-never-asks-the-browser-what-the-panel-is.md)).
>
> **Storybook titles are `Views/<View>` in BOTH builds**, and a composed ref is
> named for its renderer (`server-rendered frames` / `panel-rendered views`),
> never for a panel technology
> ([decision](docs/decisions/2026-09-13-storybook-names-a-view-and-a-property-never-a-panel-technology.md)).

## ⛔ Locked decisions — read before changing behavior

[docs/decisions/](docs/decisions/README.md) is an **append-only** log of settled
decisions. Do not silently reverse or re-litigate one. To change a locked
decision, add a NEW dated file that supersedes the old one (link both ways) and
get sign-off first. Skim the [index](docs/decisions/README.md) before any
non-trivial task. Highlights:

- **Public OSS app.** No secrets, credentials, hostnames, or real device
  identifiers in git — config comes from the environment (`.env`, gitignored).
- **⛔ User-tunable settings NEVER become env vars — and the admin panel, not
  Home Assistant, is where they must all be reachable.** Anything a user might
  change per install or per display (view settings, photo format/quality/interval,
  crop insets, brightness, …) belongs in CastKit's own admin panel, which is the
  **complete** control surface. Env vars stay reserved for **deploy-time
  infrastructure** (broker host/creds, HA URL/token, render engine, ports).
  A knob additionally earns a **Home Assistant MQTT entity** only by answering
  *"would an automation change this?"* — the view, the pause switch, the
  backlight, the photo step. A value a person sets once while hanging a panel
  (margins, photo crop, dither, registered size/rotation) does not, and a
  published install must configure fully with **no broker and no Home
  Assistant**. When a knob does earn an MQTT entity, mirror an existing one
  end-to-end: `deviceConfigStore` field → `buildDeviceTopics` /
  `buildGlobalTopics` → `buildDiscoveryMessages` /
  `buildGlobalDiscoveryMessages` → the `configKnobs` / `globalConfigKnobs` maps +
  `getKnobTopics` + the seed list in `index.ts`.
  ⚠️ The retained state topic is still today's persistence for the existing
  knobs, so do not delete a knob's discovery payload before moving its
  persistence — the value is lost on the next restart.
  ([ownership](docs/decisions/2026-09-12-castkit-owns-every-control-and-home-assistant-mqtt-is-only-the-automation-surface.md),
  [the original rule it narrows](docs/decisions/2026-07-03-user-tunable-view-settings-are-ha-config-entities.md),
  [web UI](docs/decisions/2026-08-30-web-ui-is-full-config-ha-mqtt-is-automation.md))
- **⛔ Home Assistant only SWITCHES views.** It never learns whether a display is
  interactable or whether it is live or image-streamed — CastKit alone knows
  those, and CastKit decides which view names a display is offered. An automation
  that needs to branch on panel kind means the view vocabulary is still split;
  fix the vocabulary.
  ([decision](docs/decisions/2026-09-12-home-assistant-only-switches-views-and-castkit-owns-interactivity-and-delivery.md))
- **Develop on a local disk (node-modules linker).** A mapped network share
  can't host the Yarn-workspace symlinks (both `node-modules` and PnP fail over
  SMB) — keep the working tree on a local drive.
- **Views use inline style objects** (Satori-safe flexbox), not Emotion/Tailwind.
- **⛔ A repeating list in a view draws only the rows that FINISH on the panel.**
  A panel has no scrollbar: a row the layout starts and the glass cuts in half
  stays cut until the next repaint, and on a centered column the overflow throws
  the anchor off the TOP edge too. The view — never the server — adds up its own
  header, divides the height left by one row (`countRowsThatFit` in
  `viewStyles.ts`), and drops the rest. Do not answer an overflow by capping the
  count server-side; that cap drifts the first time a font size or a gap moves,
  which is how a cap of four landed on a panel that held two
  ([decision](docs/decisions/2026-09-14-an-agenda-view-draws-only-the-rows-that-finish-on-the-panel.md)).
- **Latest dependencies**, never scaffold with old ones.
- **Prod = esbuild bundle + `node`**, never `tsx` (RAM). `yarn build` → `node
  dist/index.js`.
- **No redundant arrow return-type annotations** — let TS infer (see code-rules).

## Project

A TypeScript monorepo (Yarn 4 workspaces). The server renders a per-device HTML
view with headless Chromium (or Satori), quantizes/dithers it to the panel's
palette, and pushes it over MQTT; devices surface in Home Assistant via MQTT
discovery. Architecture + phase plan are in the README and
[docs/phase-0-findings.md](docs/phase-0-findings.md).

### Packages

| Package | Scope |
| --- | --- |
| `@castkit/sdk` | Framework-independent channel contracts, source adapters, view specifications, and plugin interfaces. |
| `@castkit/core` | Panel/palette definitions, device registry, the supersample→downscale→dither pipeline. No HTTP/engine deps. |
| `@castkit/views` | Static React view components rendered by BOTH engines (inline styles, flexbox subset). One component per file. |
| `@castkit/render` | Render engines: headless Chromium (Playwright) and Satori (SVG→resvg). Same view in, supersampled PNG out. |
| `@castkit/web` | Vite browser dev-preview + the ePaper Storybook (every view × panel, live dithering, crop controls). |
| `@castkit/server` | Hono token API + MQTT publish/subscribe + idle/active state machine. |
| `@castkit/shared` | Server↔Slatecast protocol, MQTT topic/discovery builders, view-data types. |
| `@castkit/slatecast` | The tiny Preact SPA kiosk browsers load at `/d/<id>` (browser-mode devices). |

### Bake-offs (Phase 0)

- `yarn bakeoff:render` — Decision 1: renders the now-playing card through
  Chromium AND Satori at both panels → `render-output/render/`.
- `yarn bakeoff:dither` — Decision 2: dithers card/gradient/photo with every
  algorithm × supersample factor, one contact sheet per (panel, image), mono and
  E Ink Spectra 6 separate → `render-output/dither/`.

ePaper can't be screenshotted; the sheets are the review artifact. `render-output/`
is gitignored (regenerated artifacts).

### View authoring — JSX pragma required

Every `.tsx` **view** file (in `@castkit/views`) must start with:

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
functions, no barrel files, JSDoc immediately above exports, and **no redundant
arrow return-type annotations** (let TS infer; keep only type predicates
`x is Y`, or where inference genuinely breaks — e.g. a factory whose branches
return a shared interface).

## Mirror the sibling app repos — don't regress their settled conventions

Inkcast deliberately mirrors the maintainer's other TypeScript app repos (the
`mux-magic` family): Yarn 4, TS 6 NodeNext, Biome + ESLint, Vitest, esbuild-bundle
prod, the code rules above. Those repos carry a `docs/decisions/` log of **locked**
toolchain/convention decisions. Before changing any toolchain, build, lint, test,
or code-style choice here, assume the sibling repos already settled it — match
them rather than introducing a different approach. Regressing one of their locked
decisions in this repo is the failure mode to avoid.

## Charcuterie — the shared token/logic library

CastKit is the **second consumer** of [Charcuterie](../charcuterie/), the fleet's shared
token/logic/component library (milestone M5b, 2026-07-31). `@charcuterie/tokens` and
`@charcuterie/logic` come from the **npm registry** as version ranges — never `portal:`
paths into a sibling checkout, which is correct on one machine and un-buildable anywhere
else.

Where it lands:

- `@castkit/admin` is a full `@charcuterie/ui` application. It uses the shared UI
  components, tokens, logic, and browser conventions.
- The HTTP server uses `@charcuterie/server` on Hono where the shared layer fits.
  CastKit-specific server-side rendering and static rendering remain valid tools for
  display-facing applications.
- Browser-mode display clients have a strict low-RAM budget. Do not add a React
  compatibility layer or other heavy browser dependency to Slatecast.
- Chromium is a server-side render engine for image-mode devices. It generates
  images inside CastKit; it is not a requirement for browser-mode displays.
- Keep server-side gzip and Brotli asset precompression. It reduces transfer size
  without adding browser runtime or RAM cost.
- `@castkit/views` may use `@charcuterie/tokens/epaper` where its palette fits, but it is
  not required. CastKit is a custom dashboard and display interface, so a view can use a
  purpose-built rendering treatment when the target display or small panel needs it. The real Spectra 6 palette is this repo's own
  (`packages/core/src/panels/palette.ts`, from Pimoroni's `inky`).
- `@castkit/slatecast`'s five palette custom properties alias the tokens, the scheme lives
  on `data-scheme` on `<html>` (stamped by the server at first paint), and the socket's
  lifecycle is `@charcuterie/logic`'s connection machine.

**`@charcuterie/ui` is not used by Slatecast and cannot be** — it is React, and Slatecast is
Preact under a 60 KB gz budget. Do not "fix" that with `preact/compat`; it is a known open
question, written up in
[the M5b handoff](../charcuterie/docs/2026-07-31-m5b-castkit-the-second-consumer.md),
which is the thing to read before touching any of this.

## Before every commit

- `yarn lint` — Biome (`--write --unsafe`) then ESLint (`--fix`); re-stage changed files.
- `yarn typecheck` — full monorepo type check.
- `yarn test` — Vitest. Four node projects plus `slatecast`, which runs in
  **real Chromium** (browser mode, Playwright provider) with MSW's `ws.link`
  standing in for the server socket. `yarn vitest run` for one-shot/CI.
- `yarn e2e` — Playwright specs against the real server (`e2e/testServer.ts`,
  MQTT swapped for a recording stub). Run when you touch the browser-mode
  server, the page shell, or the WebSocket protocol.

### Touched a `.py` or a `.cpp`? Those are linted too, as of 2026-09-14

`yarn lint` reads TypeScript only. The Python under `device-client/` and the C++ in
`device-client/esphome/components/` are gated by CI's `nativeLint` job, which imports
Charcuterie's `shared-native-lint.yml@workflows-v1`
([decision](https://github.com/Sawtaytoes/charcuterie/blob/master/docs/decisions/2026-09-14-shared-python-and-c-lint-config-lives-in-charcuterie-ci.md)).

The config is not in this repo — it is read from a Charcuterie checkout, because a Python
project on a Raspberry Pi has no way to install an npm package. Run the same check locally
against a clone:

```sh
CHARCUTERIE=/mnt/TrueNAS-Apps/Repos/charcuterie

ruff check  --config "$CHARCUTERIE/packages/ci/configs/ruff.toml" --fix device-client/
ruff format --config "$CHARCUTERIE/packages/ci/configs/ruff.toml"       device-client/

npx --yes clang-format@1.8.0 \
  --style=file:"$CHARCUTERIE/packages/ci/configs/clang-format.yml" \
  -i device-client/esphome/components/castkit_display/*.h
```

⚠️ **Never run either tool over `it8951e/` or `m5paper/`.** Both are patched copies of
`ilia-ae/m5paper_esphome`, and `device-client/esphome/components/PATCHES.md` states every
patch as a diff against that upstream. A formatter would rewrite every line and destroy it.
CI excludes them; a local run over the whole `device-client/` tree does not, and the first
one caught both vendored `.py` files.

⚠️ **Pin `clang-format@1.8.0`.** Two clang-format majors do not agree on the same file, so
an unpinned run disagrees with the gate. The npm package carries the binary; the version CI
uses is the workflow's `clangFormatVersion` default.

> ### `yarn test` and `yarn e2e` will not start in an agent sandbox — that is the container
>
> Both need a Playwright chromium build: `slatecast` runs in browser mode and `yarn e2e`
> launches a real browser. `@castkit/render`'s headless engine wants one too. The agent
> container ships browsers for its **own** globally-installed Playwright at a root-owned
> `/opt/pw-browsers` and points `PLAYWRIGHT_BROWSERS_PATH` there. This repo pins its own
> Playwright, which wants a **different** revision, and that directory is not writable by
> the agent user. The run dies before the first test, naming a build number that is not
> there.
>
> Install this repo's build somewhere writable and point the run at it:
>
> ```sh
> PLAYWRIGHT_BROWSERS_PATH=/tmp/pw-browsers yarn playwright install chromium
> PLAYWRIGHT_BROWSERS_PATH=/tmp/pw-browsers yarn test
> PLAYWRIGHT_BROWSERS_PATH=/tmp/pw-browsers yarn e2e
> ```
>
> Install the full `chromium` here rather than `chromium-headless-shell`: `yarn e2e` and
> `@castkit/render` both want a real browser, and the headless shell cannot serve them.
> `--dry-run` on the install prints the exact revision and path without downloading.
>
> ⚠️ **Never fix this by changing the repo.** Bumping `playwright` in any `package.json`, or
> editing `playwright.config.ts` or a `vitest.config.ts` to match the container, changes what
> this repo tests against for a reason that has nothing to do with the product. CI installs
> the pinned version itself and has never had the problem.
>
> ⚠️ **Never report the UI as untested because of it.** A run that passed under the override
> is a passing run — say that you used the override.
>
> Long version: `docs/runbooks/agent-sandbox-runtime.md` in the `agentic` workspace, and the
> decision `docs/decisions/2026-08-24-a-playwright-browser-mismatch-is-an-environment-override-never-a-version-bump.md`.

### Two Storybooks

There are **two**, composed side by side on `storybook.octen.dev`:

- **ePaper** (`@castkit/web`, `yarn storybook` / `yarn build:storybook`) — the
  static React views, every one on every example panel, with **live in-browser
  dithering** (the shared quantizer in `@castkit/core/pipeline/quantize`, the same
  code the server dithers with) and crop-inset controls (the shared
  `@castkit/core/panels/safeArea`).
- **browser** (`@castkit/slatecast`, `yarn storybook:slatecast` /
  `yarn build:storybook:slatecast`) — the Preact kiosk views. Separate because
  slatecast is Preact under a gz budget and lays out in `vw`/`vh`/`vmin`, which
  only resolve when the viewport *is* the panel; do **not** try to fold these into
  the React Storybook (and `preact/compat` is ruled out — see the M5b handoff).

CI builds both and asserts each index clears a floor (a dropped `stories:` glob
otherwise "succeeds" with an empty sidebar). The CC0 sample photos both use live
at repo-root `assets/sample-photos/` (served at `/sample-photos/`); verify a
license at source before adding one — see `assets/sample-photos/CREDITS.md`.

Testing conventions (inherited from the mux-magic family, enforced here):
`test()` never `it()`; **no snapshot or screenshot/VRT tests** — spell expected
values inline; prefer `.toBeVisible()` over `.toBeInTheDocument()`; drive
interactions with `@testing-library/user-event`. Tests are colocated
(`foo.ts` → `foo.test.ts`); fixtures in `__fixtures__/`, harness in
`__tests__/setup/`. `.spec.ts` is Playwright-only. Don't add jsdom — see
[the decision](docs/decisions/2026-07-24-slatecast-tests-real-chromium-msw-websocket.md).

Commit small and often; conventional commits; one logical change per commit.

**Push as you go — no go-ahead needed.** Commit each logical change and get it onto
`master` yourself so CI rebuilds the `:latest` image and TrueNAS/Home Assistant
self-update without the maintainer touching the server. Don't wait to be asked and
don't batch pushes.

⚠️ **`master` is protected and a direct push is REJECTED** — "6 of 6 required status
checks are expected" (measured 2026-09-12). So: push a branch, open a pull request,
and **squash-merge it yourself once the checks are green**. This is still a
single-maintainer repo and nobody else is reviewing; the pull request is the gate CI
needs, not a request for permission. Never merge on red or pending. Then finish the
job: `midclt call app.pull_images castkit` and `app.redeploy castkit` on
`root@storeman.octen`, and verify a **marker from the new build** — a 200 is also true
of the old image.

⚠️ **A browser panel is verified ON THE PANEL, never by loading its `/d/<id>` page
somewhere else.** That page is the server rendering the current bundle on demand; the
panel is a Chromium that has held one page for as long as it has been up, and a deploy
does not reload it — the socket reconnects and the panel answers every push while still
running the old bundle. On 2026-09-23 the `/d/slate-617e01` page rendered two printer
cards in a fresh browser and the glass beside the machines read `Nothing playing`. A
current build reloads a stale panel by itself
([decision](docs/decisions/2026-09-23-a-new-build-reloads-a-live-browser-panel.md)), so
this is now a check rather than a step — but it is still the check. The Pi panels run
Wayland, so `grim` reads the real framebuffer:
`ssh pi@<panel-host> 'XDG_RUNTIME_DIR=/run/user/$(id -u) WAYLAND_DISPLAY=wayland-0 grim /tmp/panel.png'`.

## Package manager

Always `yarn`, never `npm`/`npx`. One-off executables use `yarn dlx <pkg>`.
Add deps at latest: `yarn workspace @castkit/<pkg> add <dep>@latest`.

## Environment / secrets

No secrets in git. The MQTT broker host/credentials, device tokens, and any HA
connection details are read from environment variables at runtime (`.env` is
gitignored). Keep the app portable so a third party can self-host.

Env vars are for **deploy-time infrastructure only** (broker, HA URL/token,
render engine, ports, Immich URL/key). **User-tunable settings do NOT belong in
env** — they're HA/MQTT config entities (global default + per-device override);
see the locked-decision rule above.
