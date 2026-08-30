# Set up CastKit

[← Back to the README](../README.md)

CastKit runs one server for Inkcast image clients and Slatecast browser clients. Home
Assistant and CastKit communicate through MQTT. CastKit does not need Home Assistant HTTP
credentials.

## Requirements

- Docker, or Node.js 26 with Corepack
- an MQTT broker for display data, commands, and Home Assistant Discovery
- a static device file based on [`inkcast.config.example.json`](../inkcast.config.example.json)
- network access from each display to the server and broker

Chromium is included in the published container image. A source installation must install
the Playwright Chromium build.

## Configure the server

Copy [`.env.example`](../.env.example) to `.env`. Set `MQTT_URL`, `MQTT_USERNAME`, and
`MQTT_PASSWORD` for the broker. Use an `mqtts://` URL and `MQTT_CA_FILE` when the broker
requires a private certificate authority.

`PORT` defaults to `8788`. `INKCAST_API_TOKEN` protects the HTTP API. Generate a long random
value for any server that is not restricted to a trusted network.

The remaining environment variables control deployment infrastructure. User settings such
as the active view, rotation, dither profile, photo selection, and brightness live in the
Web UI and retained MQTT state. They are not environment variables.

## Configure displays

Copy the example device file to a gitignored `inkcast.config.json`. Set
`INKCAST_DEVICES_FILE` to its container path. Real device identifiers and labels do not
belong in the repository.

See [Add a display](adding-a-device.md) for the device schema, Home Assistant entities, and
receiver steps. CastKit reads this file at boot, so a device-list change requires a server
restart. Display settings update live through the Web UI or MQTT.

## Start the container

```sh
docker run --rm --env-file .env -p 8788:8788 \
  -v "$PWD/inkcast.config.json:/config/devices.json:ro" \
  -e INKCAST_DEVICES_FILE=/config/devices.json \
  ghcr.io/sawtaytoes/castkit:latest
```

Open `http://localhost:8788/manage/`. Confirm that the configured displays appear. If MQTT is
enabled, also confirm that Home Assistant Discovery creates one device for each entry.

Browser-mode displays load `http://<server>:8788/d/<device-id>`. Image-mode receivers use
the MQTT topics for their matching device ID.

## Run from source

```sh
corepack yarn install
corepack yarn playwright install chromium
corepack yarn build
corepack yarn start:prod
```

For development, use `corepack yarn dev` for the browser preview and
`corepack yarn dev:server` for the server. Use these checks before a change:

```sh
corepack yarn lint
corepack yarn typecheck
corepack yarn test
```

The [architecture guide](architecture.md) explains the data flow. The
[decision index](decisions/README.md) records the platform boundaries and the reasons for
the two client modes.
