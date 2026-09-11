# CastKit owns the backlight level and restores it on reconnect

- **Status:** Accepted
- **Date:** 2026-09-11
- **Type:** Device contract
- **Supersedes:** —
- **Superseded by:** —

## Decision

For every `hasMqttBacklight` browser device the server keeps a per-device
**backlight level** (integer 0–100 %, default 100) and is its source of truth.

- Two CastKit-owned topics: `castkit/<id>/backlight_level/set` (command) and
  `castkit/<id>/backlight_level` (retained state — the persistence, exactly as
  `theme` and `rotation` are stored). Home Assistant sees it as a config
  **Number**, "Display: Backlight level", and the management UI as
  **Backlight (%)** on the browser device.
- The level changes from two sources. A command on `backlight_level/set` stores
  it, retains the state, and publishes `backlight/brightness/set` =
  `round(percent × 255 / 100)` so the panel dims at once. A command on the
  light's own `backlight/brightness/set` (Home Assistant's light entity) stores
  `round(brightness × 100 / 255)` and retains the state, and **nothing else** —
  the agent already consumed that command, and re-publishing it would loop.
- The server subscribes to `backlight/available`. On every transition to
  `online`, including the first one seen after the server starts, it sends the
  stored level as `backlight/brightness/set`. A retained level that lands after
  the retained `online` is sent too; a retained level that lands before it waits.
  The command is never retained: the availability transition is the restore
  path, and a retained command would replay under Home Assistant's own sends.
- The level is a brightness only. ON/OFF stays with the light entity and the
  agent; the server never publishes `backlight/set`.
- A device with `hasMqttBacklight: false` gets no topics, no entity, no knob.
- The SPA payload is unchanged: a browser cannot reach a backlight, so the level
  lives in a server-side store, not in `BrowserDeviceSettings`.

## Context

The WT32-SC01 Plus panel boots with `restore_mode: ALWAYS_ON`, which is full
brightness, and the owner's Home Assistant automation only sends ON and OFF. Any
level set by hand was gone at the next reboot, and CastKit stored nothing that
could put it back. The kiosk Pi backlight agent has the same shape: it executes
`backlight/brightness/set` and remembers nothing. The light entity cannot be the
owner either — its state is whatever the agent last reported, and an agent that
has just rebooted reports full.

The owner wants the level configurable per device because the panels differ: the
SC01 supports variable brightness and is unreadable when it is too bright. He
also wants `slate-8f27fc` left at 100 % until he has tuned it, which the default
of 100 gives for free — until a level is set, every publish is a no-op against
what the firmware already does.

## Why

- **The server is the only party that survives the reboot.** The agent forgets,
  the light entity mirrors the agent, and retained MQTT state is the persistence
  CastKit already uses for every other per-device knob.
- **Two sources, one store, no loop.** Folding the light's brightness command
  into the same store keeps the Number and the light in agreement whichever one
  the user touches, and the asymmetric rule — only `backlight_level/set` fans
  out to the agent — is what stops the two command topics feeding each other.
- **Restore on the availability edge, not on a timer.** `online` is the one
  signal that says the agent is listening again; sending on every `online`
  payload would spam a device whose LWT is re-asserted, and a timer would fire
  when nobody is there to hear it.
- **Default 100 changes nothing.** The owner asked for the knob and asked for
  the SC01 to stay bright; both hold on the same default.

## Evidence

- Owner, 2026-09-11: "Unlike my other screen, I think this one supports variable
  brightness. We need to make that configurable per device in CastKit. I like the
  screen bright, but if the backlight is too bright, I can't see or read
  anything."
- Owner, 2026-09-11: "Yes, let's add this and see. I'll have to play with it
  another night for this device, the SC01, so leave it at 100% for now."
- Implementation: `packages/server/src/browser/browserBacklightStore.ts`,
  `packages/server/src/browser/browserMode.ts` (`backlightLevel`,
  `backlightBrightness`, `backlightAvailability` routes),
  `packages/server/src/homeAssistant/browserDiscovery.ts` (the Number entity),
  `packages/admin/src/App.tsx` (the **Backlight (%)** knob).
