# Adding a device (display) to Inkcast

## How device registration works

Devices are **static** — they do **not** self-register. There is no
device→server discovery, no `POST /api/devices`, no auto-provisioning. The
server reads its full device list **once at boot** and publishes a fixed set of
Home Assistant MQTT-discovery entities for each known device. (The "discovery"
in Inkcast is the *server advertising entities to HA* — not displays announcing
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
| `colorMode` | ✅ | `"monochrome"` (2-ink black/white) or `"spectra6"` (6-color Spectra). **The palette is derived from this** — you never hand-write RGB. |
| `rotation` | — | Clockwise degrees (`0`/`90`/`180`/`270`), default `0`. Also tunable live from HA (see below), so a rough guess here is fine. |
| `ditherProfile` | — | `{ algorithm, supersampleFactor }`, default `{ "floyd-steinberg", 2 }`. `algorithm` is one of the dither options; `off` hands the panel a full-color image (photo frame). |
| `nowPlayingEntityId` | — | Pin this display's Now Playing to a specific HA `media_player`; omit to follow the active player. |
| `photoPeople` | — | Array of Immich person names, e.g. `["Ada", "Grace"]`. **Seed only:** fills the Photo Frame people filter when the broker has no retained value (first boot, or after a retained wipe). HA owns the live value — editing it there never writes back here, and the seed never overwrites what the broker restored. Omit and the frame starts blank. |

Browser-mode entries use `renderer: "browser"`, `shape`, `hasTouch`, and
`color` instead of the image palette fields. An optional `externalViews` array
adds deployment-owned applications to that device's Home Assistant **View**
select. Each entry has a display name and an absolute HTTP(S) URL. The Slatecast
client presents the application in a full-panel frame, while the remote-display
receiver keeps its frame-bound touch guard around the whole application view.
An optional `zoom` (0.5 to 4) scales that application: `1.5` on a 1280x720
panel gives it an 853x480 viewport at a device pixel ratio of 1.5, so an app
laid out for a lower-density screen reads at a comfortable size and stays
sharp.

An optional `healthUrl` (an absolute URL) keeps a proxy's error page off the
panel. The server requests it about every 10 seconds, with a 5-second timeout,
and treats only a 2xx answer as available. The first request runs at startup,
and the view counts as not available until one succeeds. While it is not
available the panel shows `<name> is not available` in place of the frame. When
the application answers again the panel loads a fresh frame by itself, so a
502 from the reverse proxy never stays on the glass. The request comes from
the server, so the application needs no CORS headers, and the URL is never sent
to the panel. Without `healthUrl` the frame is always shown.

An optional `views` array is the ordered allow-list for that display's View
selector and local drawer. When it is absent, CastKit offers every compatible
native and external view, which preserves existing installations. Set
`hasViewDrawer: true` only on an installation that needs panel-local navigation.
It defaults to `false`, so touch capability does not place edge handles over
every touch display. Both settings are editable in CastKit's device editor.

Browser devices normally publish a CastKit backlight entity for the kiosk-side
MQTT agent. Set `hasMqttBacklight: false` when the receiver already exposes its
backlight through another Home Assistant integration, such as ESPHome. This
prevents a second unavailable backlight entity.

For a `hasMqttBacklight` device CastKit also **owns the backlight level**: a
**Display: Backlight level** number (0–100 %, default 100) on
`castkit/<id>/backlight_level/set` / `castkit/<id>/backlight_level`. The agent
keeps nothing across a reboot and the HA light only sends what was last touched,
so the server stores the level (retained state = persistence, like theme and
rotation), sends it as `backlight/brightness/set` the moment it is set, and sends
it again whenever `backlight/available` returns to `online`. A brightness the HA
light sends is folded into the level without an echo. The management UI shows
the same knob as **Backlight (%)** on a browser device. See
[the decision](decisions/2026-09-11-castkit-owns-the-backlight-level-and-restores-it-on-reconnect.md).

**Palette note:** there are exactly two palettes — `MONOCHROME_PALETTE` and
`SPECTRA6_DEFAULT_PALETTE`, keyed by `colorMode`. There is no per-device custom
palette. A new panel of an existing color family (e.g. another E Ink Spectra 6
display at a different resolution) needs **no code change** — just a new entry.

## What each device automatically gets in Home Assistant

On boot the server publishes, per device: an **Image** entity named after the
device itself (it *is* the display, so it carries no suffix), a **View**
select, a **Refresh** button, and the config entities **Display: Dither**,
**Display: Rotation**, **Display: Brightness/Saturation**, the mat
**Display: Margin** edges, **Photo Frame: People/People-minimum/Query/Format/Quality/Rotation-minutes/Recency**,
the **Photo Frame: Crop** edges, and Next/Previous photo buttons.

**Margin and Crop are opposites, and both exist.** A *margin* is how far the
physical mat overlaps the panel; every view is laid out inside what is left and
the covered band renders white, so nothing is cut. A *crop* throws part of the
picture away and zooms the rest to fill the frame; it applies to photo views
only. Both default to 0. See
[docs/decisions/2026-09-08-margin-pushes-in-and-crop-cuts-away.md](decisions/2026-09-08-margin-pushes-in-and-crop-cuts-away.md). All are editable live; their retained MQTT state
is the persistence, so they survive a restart with no config file for user
settings. (**Rotation** in particular is a live select — you can correct an
upside-down panel from HA without editing this file.)

**How the people list combines:** `Photo Frame: People` is a comma-separated
name list, and `Photo Frame: People minimum` says how many of them a photo must
contain — `1` (the default) is any of them, a value equal to the name count is
all of them, and anything between is "at least K of N". A threshold nothing
satisfies falls back to any-of and logs a warning rather than blanking the
frame. See
[the decision](decisions/2026-07-26-photo-people-minimum-is-a-threshold-not-an-and-or-toggle.md).

Retained state is the persistence, but it is not indestructible — a broker wipe
or a topic migration clears it. Knobs that would leave a display unusable when
blank therefore carry a **registry seed** the server republishes on boot when the
broker has nothing: `rotation` and `ditherProfile` since the beginning, and
`photoPeople` as of 2026-07-26. See
[the decision](decisions/2026-07-26-photo-people-seeds-from-the-device-registry.md).

## Adding a device — steps

1. Create/edit the gitignored **`inkcast.config.json`** (a JSON array; copy
   `inkcast.config.example.json` as a starting point) and add the new entry.
2. Point the server at it: set `INKCAST_DEVICES_FILE=/path/to/inkcast.config.json`
   in the deployment env.
3. On TrueNAS: mount the file into the container and set that env var in the app
   config, then restart the app so it reloads the list.
4. Flash the Pi (or ESPHome device) with the matching `id`/MQTT topic and confirm
   the new image entity appears in Home Assistant under the device's name.

Because the list is read only at boot, **adding or renaming a device requires a
restart** — but changing any *setting* on an existing device (view, rotation,
dither, photo config, …) is live over MQTT and needs no restart.

## Adding the two 13.3" panels

Same as above — one entry each. Before adding them, confirm:

- **Native resolution** (`width`×`height`).
- **Color mode**: 6-color (`"spectra6"`) or mono (`"monochrome"`). If the panel is a
  different color technology than E Ink Spectra 6 or monochrome, that's a palette question to settle
  first (only those two palettes exist today).
- **MAC** of each unit.
- **Provenance**: Pimoroni/official is fine; **Waveshare is Chinese-origin** and
  is a flagged sourcing decision (see the root workspace `AGENTS.md` hard
  constraint) — confirm before adopting.
