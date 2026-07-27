# A per-device "Updates" switch pauses a display, with no global counterpart

- **Status:** Accepted
- **Date:** 2026-07-27
- **Type:** Architecture / HA contract
- **Supersedes:** —
- **Superseded by:** —

## Decision

Every image-mode (Inkcast) device gets a Home Assistant **`switch`** entity named
**"Updates"** (`switch.<device>_updates`, MQTT `<base>/<device>/updates{,/set}`).
When it is **OFF the display renders nothing** — the panel keeps whatever frame
is on glass. When it goes back **ON the server repaints immediately**.

The guard lives in **one place**: `pushController.pushDevice`. It returns early
**before rendering**, so a paused display costs neither an MQTT publish nor a
Chromium render.

`renderDevice` is **deliberately NOT guarded** — the HTTP `/render` and
`/image` endpoints must keep working while a panel is paused, so the web preview
and the M5Paper token flow still function.

This knob is **per-device only. There is intentionally no global counterpart**,
which departs from the otherwise-universal rule in
[2026-07-03-user-tunable-view-settings-are-ha-config-entities.md](2026-07-03-user-tunable-view-settings-are-ha-config-entities.md)
that every user knob ships as a global default plus a per-device override.

Default is **enabled**. A store with no value reads `true`.

## Context

There was previously **no way to stop a display re-rendering**. Two independent
timers drive repaints — the photo-rotation tick in `photoFrameAdapter` and the
per-minute `clockTicker` — plus event-driven pushes from view selects, the
Refresh button, and the three HA data topics.

The house wants displays to go quiet when nobody can see them: the room's lights
being off is the signal (a dark room means the panel is invisible, so rendering
into it is pure waste — Immich fetches, Chromium renders, ePaper wear).

Before this, the only ways to approximate a pause were all bad: set the rotation
interval to its 1440-minute maximum (still one refresh a day, and no effect at
all on clock views), or blank the `photo_people`/`photo_query` filter so the
adapter bails (destroys the user's configured filter and, again, does nothing
for clock views).

## Why

- **One chokepoint beats five guards.** Every render path already funnels
  through `pushDevice`; guarding there covers the clock tick, the photo
  rotation, view selects, the Refresh button, and the `now_playing` / `weather`
  / `agenda` data topics at once, and cannot be bypassed by a future caller.
- **Bail before rendering, not after.** The expensive part is the headless
  Chromium render, so the early return is placed above it.
- **ePaper holds its last frame at zero power**, so "stop pushing" is a complete
  implementation of "freeze the display" — no blank/clear path is needed. This is
  the same property the M5Paper client already relies on to survive a reboot.
- **Resume must repaint at once.** A clock view that resumed on the old frame
  would show a stale time for up to a minute. The knob's `onApplied` hook pushes
  immediately; because `pushDevice` self-guards, the same hook is harmlessly a
  no-op when the switch was just turned OFF.
- **No global counterpart, on purpose.** Every other knob is a *household
  default* a display may override — "what interval should photos rotate at?"
  sensibly has a house-wide answer. A pause is not a default; it is a **live,
  per-room signal** derived from that room's lights. A global version would also
  make precedence genuinely ambiguous: should a house-wide OFF beat a per-device
  ON, or the reverse? Both answers are defensible, which is the tell that the
  knob shouldn't exist. If a "vacation mode" is ever wanted, it belongs as an HA
  automation that turns all the per-device switches off — not as a second source
  of truth in the server.
- **Default enabled** so an install that never touches the switch behaves exactly
  as it did before this change, and a display can never be *silently* frozen by
  upgrading.

## Implementation

- `deviceConfigStore`: `getIsUpdatesEnabled` / `setIsUpdatesEnabled` /
  `getHasUpdatesEnabledValue`. Absent = enabled.
- `buildDeviceTopics`: `updatesCommand` / `updatesState`.
- `buildDiscoveryMessages`: the **first `switch` component** in the codebase,
  placed with the primary controls (View, Refresh) rather than under
  `entity_category: "config"` — it is an operational control, not a setting.
- `index.ts`: a `configKnobs` entry (`updates`) using the standard
  `applyPayload` / `getHasValue` / `onApplied` shape, `parseSwitchPayload`
  accepting `ON|OFF|true|false|1|0`, a `getKnobTopics` mapping, and a seed of
  `"ON"` so HA never shows "unknown".
- `pushController.pushDevice`: the guard.
- `photoFrameAdapter`: paused devices are additionally filtered out of the
  rotation tick, so a dark room spends no Immich API calls either.

Retained MQTT remains the persistence layer, so a paused display stays paused
across a server restart — and stays visible as paused in HA.

## Evidence

> "It should stop updating unless I'm here. It's not occupancy I care about but
> the lights themselves because the lights react to occupancy… It's more that
> when the lights go out, no one can see the screen, so why update it?"

> (chose "Add a real pause switch" over an HA-only workaround)

— user, this chat (2026-07-26).
