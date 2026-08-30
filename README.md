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

- [Setup and configuration](docs/setup.md)
- [Add a display](docs/adding-a-device.md)
- [Architecture](docs/architecture.md)
- [Decision records](docs/decisions/README.md)

CastKit is available under the [MIT License](LICENSE).
