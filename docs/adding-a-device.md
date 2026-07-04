# Adding a device (screen) to Inkcast

## How device registration works

Devices are **static** — they do **not** self-register. There is no
device→server discovery, no `POST /api/devices`, no auto-provisioning. The
server reads its full device list **once at boot** and publishes a fixed set of
Home Assistant MQTT-discovery entities for each known device. (The "discovery"
in Inkcast is the *server advertising entities to HA* — not screens announcing
themselves.)

The device list comes from a JSON file pointed to by the **`INKCAST_DEVICES_FILE`**
env var (`loadDevices` in `packages/server/src/config/env.ts`). If that var is
unset, the server falls back to the two built-in **`SEED_DEVICES`** examples
(`packages/core/src/devices/device.ts`) — which is what an out-of-the-box
container runs on.

> The public repo must never contain real MACs/labels, so your real fleet lives
> in a **gitignored** `inkcast.config.json` (the `inkcast.config.*` glob is
> ignored; only `inkcast.config.example.json` is tracked). See
> `docs/decisions/2026-07-01-public-oss-app-on-github.md`.

## The device schema

Each entry is one object in a JSON array (`DeviceConfigSchema`,
`packages/server/src/config/env.ts`). See `inkcast.config.example.json` for a
working file.

| Field | Required | Notes |
| --- | --- | --- |
| `id` | ✅ | Stable slug — used in every MQTT topic (`inkcast/<id>/…`) and HA entity id. Don't change it later. |
| `label` | ✅ | Human name shown in Home Assistant. |
| `mac` | ✅ | The device's wire identity; shown in HA's device `connections`. Lower-case colon-separated. |
| `width`, `height` | ✅ | Native panel resolution in px. Any positive integers — no fixed list. |
| `colourMode` | ✅ | `"mono"` (2-ink black/white) or `"e6"` (6-colour Spectra). **The palette is derived from this** — you never hand-write RGB. |
| `rotation` | — | Clockwise degrees (`0`/`90`/`180`/`270`), default `0`. Also tunable live from HA (see below), so a rough guess here is fine. |
| `ditherProfile` | — | `{ algorithm, supersampleFactor }`, default `{ "floyd-steinberg", 2 }`. `algorithm` is one of the dither options; `off` hands the panel a full-colour image (photo frame). |
| `nowPlayingEntityId` | — | Pin this screen's Now Playing to a specific HA `media_player`; omit to follow the active player. |

**Palette note:** there are exactly two palettes — `MONO_PALETTE` and
`E6_DEFAULT_PALETTE`, keyed by `colourMode`. There is no per-device custom
palette. A new panel of an existing colour family (e.g. another 6-colour E6
screen at a different resolution) needs **no code change** — just a new entry.

## What each device automatically gets in Home Assistant

On boot the server publishes, per device: a **Screen** image entity, a **View**
select, a **Refresh** button, and the config entities **Display: Dither**,
**Display: Rotation**, **Display: Brightness/Saturation**, the mat **Crop**
insets, **Photo Frame: People/Query/Format/Quality/Rotation-minutes/Recency**,
and Next/Previous photo buttons. All are editable live; their retained MQTT state
is the persistence, so they survive a restart with no config file for user
settings. (**Rotation** in particular is a live select — you can correct an
upside-down panel from HA without editing this file.)

## Adding a device — steps

1. Create/edit the gitignored **`inkcast.config.json`** (a JSON array; copy
   `inkcast.config.example.json` as a starting point) and add the new entry.
2. Point the server at it: set `INKCAST_DEVICES_FILE=/path/to/inkcast.config.json`
   in the deployment env.
3. On TrueNAS: mount the file into the container and set that env var in the app
   config, then restart the app so it reloads the list.
4. Flash the Pi (or ESPHome device) with the matching `id`/MQTT topic and confirm
   the new **Screen** entity appears in Home Assistant.

Because the list is read only at boot, **adding or renaming a device requires a
restart** — but changing any *setting* on an existing device (view, rotation,
dither, photo config, …) is live over MQTT and needs no restart.

## Adding the two 13.3" panels

Same as above — one entry each. Before adding them, confirm:

- **Native resolution** (`width`×`height`).
- **Colour mode**: 6-colour (`"e6"`) or mono (`"mono"`). If the panel is a
  different colour technology than E6/mono, that's a palette question to settle
  first (only those two palettes exist today).
- **MAC** of each unit.
- **Provenance**: Pimoroni/official is fine; **Waveshare is Chinese-origin** and
  is a flagged sourcing decision (see the root workspace `AGENTS.md` hard
  constraint) — confirm before adopting.
