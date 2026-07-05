# Plan: add two 13.3" Impressions + re-slug all four screens to opaque ids

**Status:** planned, blocked on hardware (real MACs; the two 13.3" panels not yet on hand).
**Decision basis:** [decisions/2026-07-05-device-id-is-opaque-immutable-identity.md](decisions/2026-07-05-device-id-is-opaque-immutable-identity.md).

## Architecture as-built (so the plan is grounded)

Everything is MQTT pub/sub through the MQTT broker. Three actors, none of which open a
direct connection to another:

- **Inkcast server (container)** — *renders pixels* and owns the **device registry**. It
  reads its device list once at boot (`INKCAST_DEVICES_FILE`, else the built-in
  `SEED_DEVICES`) and, per device, **publishes the retained Home Assistant MQTT-discovery
  configs** to `homeassistant/<component>/inkcast/<id>_<entity>/config`. That publish is
  what makes the devices/entities appear in HA. It also owns the config store (dither,
  rotation, crop, photo settings, …), persisted as retained MQTT state.
- **Home Assistant** — the brain: pushes each screen's view data
  (`inkcast/<id>/{now_playing,weather,agenda}/set`), drives the View select / Refresh, and
  edits config knobs. HA does **not** originate the registry — it receives whatever Inkcast
  advertises via discovery.
- **Device (Pi Zero receiver)** — a dumb sink: `inkcast_receiver.py` subscribes to
  `inkcast/<id>/image` (retained PNG), decodes, draws. It self-registers nothing and holds
  no settings.

> Today there is **no devices file and no mount** on the running app — it is on
> `SEED_DEVICES` (`inky-phat`, `inky-impression`). Introducing a devices file is a
> prerequisite of this plan, not just an edit.

## Target slugs (opaque, immutable)

| Screen | New `id` | geometry | mode |
| --- | --- | --- | --- |
| Inky pHAT (existing) | `inky-a615f8` | 250×122 | mono |
| Inky Impression 7.3" (existing) | `inky-6e6697` | 800×480 | e6 |
| Inky Impression 13.3" (new) | `inky-07769e` | 1600×1200 | e6 |
| Inky Impression 13.3" (new) | `inky-4da1be` | 1600×1200 | e6 |

Target `inkcast.config.json` is already drafted (gitignored) with these four entries;
MACs are `REPLACE_WITH_REAL_MAC_*` placeholders.

## Steps (execute once panels + MACs are in hand)

1. **Fill real MACs** into the four entries in `inkcast.config.json` (the `mac` field only
   feeds HA's device `connections` block — informational; it does not affect topics).
2. **Introduce the devices file on the TrueNAS app:** add a host-path storage mount for
   `inkcast.config.json` into the container and set `INKCAST_DEVICES_FILE=<mounted path>`.
   Restart the app so it reloads the list.
3. **Purge the old seed identities' retained data** (else HA shows ghosts and the broker
   serves stale images). For the retiring ids `inky-phat` and `inky-impression`, publish an
   empty retained payload to every `homeassistant/<component>/inkcast/<old-id>_*/config`
   discovery topic and to every `inkcast/<old-id>/#` runtime topic that is retained.
4. **Flash / reconfigure each Pi** with its new image topic
   (`INKCAST_IMAGE_TOPIC=inkcast/<new-id>/image`) in the systemd drop-in; restart the
   receiver.
5. **Re-apply HA presentation** to the freshly-created entities: friendly name
   (e.g. "Kitchen Counter eInk Screen") + area. These do NOT carry over from the old
   entities — that loss is the known cost of re-slugging (per the decision record).
6. **Update the HA automations' `inkcast_device`** to the new slugs
   (`automation.control_*_eink_screen` → `data.inkcast_device`). For the two new screens,
   clone the existing per-screen automation (Now Playing priority + Weather + Agenda +
   15-min refresh + HA start) once their location/players/calendars are known.
7. **Verify** each screen paints (Refresh button) and its entities are live; confirm no
   ghost devices remain from the old ids.

## Blocked on

- The two Pimoroni Inky Impression 13.3" panels (Spectra-6 E673, 1600×1200) — confirmed
  provenance (Pimoroni, clears the no-Chinese-origin constraint).
- Real MACs for all four Pis.
- Each new screen's location → HA friendly name/area + which `media_player`s and
  calendars feed its content automation.
