# Presto ambient light delivery

CastKit owns one per-device `ambientLight` control in `controls.json`:
`isOn`, integer `brightness` (0–100), `mode`, and boolean `demo`. Modes are
`album-glow`, `swipe-comet`, `meeting-fuse`, `weather-aura`, and `progress-bar`.
The LEDs are independent of the LCD backlight. Missing ambient controls leave
older installations unchanged and instruct new receivers to leave their LEDs off.

The worker reads controls independently of screenshot delivery. It converts
`isOn` to `on` in compact JSON in the `X-CastKit-Ambient` response header,
including unchanged-frame 204 responses. Optional `ambientLightData` contributes
song progress, playing status/duration, time until the next timed agenda item,
and weather. Absent metadata means no active song/event and unknown weather;
the explicit demo control selects synthetic previews on the receiver.

Seven RGB colors come from the existing captured PNG, cropped to the artwork's
native interaction bounds when available. Palette extraction reuses the frame's
PNG decode and requires no additional screenshot. Disabled lights and modes
without artwork colors use the existing encoding path unchanged. The firmware
animates effects locally; screenshot cadence does not set animation cadence.

`X-CastKit-Ambient-Ack: 1` requests a physical control report after changes or
reconnects. The existing `/control-ack` document keeps `backlight_percent` and adds
`ambient_light: {on, brightness, mode, demo}`. Metadata/palette updates do not
request additional acknowledgements. Health exposes desired `ambient_light`
and `reported_ambient_light` separately; a desired state alone does not establish
physical application. Board restarts invalidate the physical report.

This extends the existing authenticated relay. It does not create another broker
connection on the board or make the device dependent on Home Assistant. MQTT and
native management commands converge in CastKit before this delivery step.
