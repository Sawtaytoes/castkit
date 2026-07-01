# Inkcast

A self-hostable **e-ink display platform**: a server renders per-device views,
dithers them for each panel, and **pushes** the finished image to cheap Wi-Fi
receivers (Raspberry Pi Zero W). Displays show up in Home Assistant automatically
via MQTT discovery — you can *see* every screen and control it from HA.

> **Status: early (Phase 0 / proof-of-concept).** The render + dither spine and a
> render-engine / dithering bake-off are in place. The API server, MQTT push, and
> device client are being built out. Not yet production-ready.

## Why

E-ink photo frames and info screens usually render *on the device*, which needs a
beefy Pi. Inkcast flips that: the **server does all the work** (render + dither)
and the device just receives a PNG and draws it — so a 512 MB Pi Zero W is enough.
Because the server pushes on data change (not a slow poll), a clock or now-playing
screen stays accurate.

## Architecture

```
Home Assistant (data: media player, photos, presence, weather)
        │
        ▼
Inkcast server (Docker)
  • device registry (resolution, colour mode, palette, rotation, dither profile)
  • React view → HTML → render (headless Chromium or Satori) → PNG
  • per-panel pipeline: supersample → Lanczos downscale → dither to panel palette
  • idle/active state machine (playlist + priority push overlay)
  • token API + MQTT (publishes each device as HA entities)
        │  MQTT push
        ▼
Pi Zero W (dumb receiver) → draws the PNG to the Inky panel
```

Supported panels today: 1-bit **mono** (Inky pHAT 250×122) and 6-colour **E6
"Spectra 6"** (Inky Impression 7.3" 800×480). Designed for N devices.

## Packages

| Package | What it does |
| --- | --- |
| `@inkcast/core` | Panels, palettes, device registry, the supersample/downscale/dither pipeline. |
| `@inkcast/views` | React view components (inline styles + flexbox so both render engines agree). |
| `@inkcast/render` | Render engines — headless Chromium (Playwright) and Satori (SVG→resvg). |

## Quick start

Requires Node 24+ and Yarn 4 (bundled via `.yarn/releases`).

```bash
yarn install
yarn playwright install chromium   # the Chromium render engine needs a browser

# Decision 1 — compare render engines (Chromium vs Satori) on both panels:
yarn bakeoff:render                # → render-output/render/engine-comparison.png

# Decision 2 — compare dithering algorithms × supersample per panel:
yarn bakeoff:dither                # → render-output/dither/<panel>--<image>.png
```

Open the PNGs under `render-output/` to compare. (E-ink can't be screenshotted, so
these contact sheets are how you judge output before it hits a panel.)

## Development

```bash
yarn lint        # Biome + ESLint (auto-fix)
yarn typecheck   # full monorepo type check
yarn test        # Vitest
```

Code conventions live in [AGENTS.md](AGENTS.md); settled design decisions in
[docs/decisions/](docs/decisions/README.md).

## License

[MIT](LICENSE) © Kevin Ghadyani
