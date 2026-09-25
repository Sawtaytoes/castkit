# CastKit

**[Set up CastKit with Docker →](docs/setup.md)**

CastKit is a self-hostable home display platform. One server drives image and browser
displays over MQTT, while Home Assistant supplies view data, selects active views, and
executes device commands.

CastKit supports two client modes:

- **Inkcast** (`image`) renders and dithers views on the server, then sends PNGs to small
  ePaper receivers.
- **Slatecast** (`browser`) serves a small Preact client for live and touch-capable displays.

## Run with Docker

Complete [the setup guide](docs/setup.md) before you start the server. A useful installation
needs an MQTT broker and a device configuration file.

```sh
docker run --rm --env-file .env -p 8788:8788 \
  -v "$PWD/inkcast.config.json:/config/devices.json:ro" \
  -e INKCAST_DEVICES_FILE=/config/devices.json \
  ghcr.io/sawtaytoes/castkit:latest
```

## Run from source

```sh
corepack yarn install
corepack yarn playwright install chromium
corepack yarn build
corepack yarn start:prod
```

Use `corepack yarn dev` for the browser preview and `corepack yarn dev:server` for the
server during development.

## Documentation

**Start here**

- [Setup and configuration](docs/setup.md) — what to install and what to put in `.env`
- [Add a display](docs/adding-a-device.md) — registering a panel and giving it its properties
- [Architecture](docs/architecture.md) — how the pieces fit together

**The display model**

- [Display properties, and what each one changes](docs/display-properties.md) —
  the reference. A display is a **panel model** plus an **installation**, and
  every property states what it changes. Read this before adding a panel kind,
  designing a view, or deciding what a view is allowed to print.
- [Remote browser displays and app-owned JSON manifests](docs/remote-display.md) —
  the `live-browser` and remote-framebuffer paths
- [One view vocabulary — the unification plan](docs/2026-09-12-unify-one-view-vocabulary-plan.md) —
  what is built, what is not, and the order of the remaining work

**The views**

- [AI Usage](docs/ai-usage-view.md) — remaining subscription quota per AI
  provider, on an `ai-usage.v1` channel
- [Printer Status](docs/printer-status-view.md) — the 3D prints running right
  now, with Pause, Resume and Stop

**Reference**

- [Decision records](docs/decisions/README.md) — why things are the way they
  are. Read the relevant one before proposing a change; a settled decision
  outranks a fresh instinct.
- [Future work](docs/future-work.md)
- [Handoff notes](docs/HANDOFF.md)

⚠️ CastKit carries **no household inventory**. The property model lives here;
which panels a given deployment owns lives with that deployment.

CastKit is available under the [MIT License](LICENSE).
