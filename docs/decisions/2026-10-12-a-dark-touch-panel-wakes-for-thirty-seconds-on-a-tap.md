# A dark touch panel wakes for thirty seconds on a tap

Status: Accepted
Date: 2026-10-12
Type: Device interaction
Supersedes: None
Superseded by: None

## Decision

A touch display whose backlight CastKit holds at zero lights on a tap, at the brightness chosen for it, for 30 seconds, then goes dark again. The tap that wakes it presses nothing; later taps reach the view and restart the window, and a finger still on the glass holds it lit. This holds whatever turned it off — the management switch, room following, or a Home Assistant automation — and CastKit's stored power stays Off throughout, because the wake is a temporary local override, not a power change.

The receiver owns the timer, so the panel lights without a network round trip. CastKit only supplies the level and the window, as `wake_percent` and `wake_seconds` in `controls.json`, which the remote-display worker forwards to the Presto's `set_wake_controls` action. Firmware without that action keeps the old behavior.

The wake level is the display's chosen backlight level rather than a second setting: the owner asked for "just enough to see it", and that level is already the one he reads the panel at.

## Context

The Living Room panel follows the Living Room lights, so it is dark when the owner is in the room under the Office lights; a bedside panel would be dark all night. The Presto firmware dropped every touch at zero brightness, so a dark panel could not be read at all.

None of the four Prestos has a light sensor. Pimoroni's own auto-backlight example reads an add-on LTR-559 (the Multi-Sensor Stick) over the Qw/ST connector; sizing the wake and normal brightness from measured lux is a follow-up that needs that hardware.

## Why

Firmware-side timing makes the wake instant and keeps working while CastKit or the network is slow. Swallowing the waking contact means a blind tap in the dark cannot pause music or open a view. Reusing the chosen level avoids a second brightness setting that would drift from the first.

## Evidence

Owner, T3 Code worktree `t3code-b04321cc`, 2026-10-12 (chat UUID unavailable):

> I'd also like it that if the lights are off and I tap the screen, for it to come on, and then it can go away again after 30s. That happens in the Living Room when the Office lights are on but the Living Room lights are off.

> Say I have one touch screen next to a bed while sleeping. The lights will remain off in the room, and you can't see it. If you tap it, it should come on. Doesn't have to be 100% either. Just enough to see it. If these Prestos or other displays I have/buy include light meters, this is the best time to use them to figure out the proper backlight brightness!

- Firmware: `Sawtaytoes/esphome-presto#2` (`presto_wake.h`, host-tested by `tests/test_wake.py`).
- Server: `packages/server/src/browser/remoteBacklight.ts` (`resolveWake`), covered by `browserModeRemoteBacklight.test.ts`.
- Worker: `device-client/remote-display/esphome_presto.py` (`send_wake_controls`), covered by `test_esphome_presto.py`.
- Light sensor: `external/pimoroni-presto/examples/auto_backlight.py` imports `breakout_ltr559` — an add-on, not on the board.
