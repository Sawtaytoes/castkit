# An ESPHome receiver can be a registered Slatecast device

- **Status:** Accepted
- **Date:** 2026-09-10
- **Type:** Architecture / Device integration
- **Supersedes:** —
- **Superseded by:** —

## Decision

A constrained ESPHome receiver can register as a normal browser-mode CastKit device. CastKit serves its remote-display manifest at `/d/<id>/castkit.json`, and the renderer sends the standard Slatecast page to the receiver. The device receives the same Home Assistant discovery, view selection, data pushes, and command path as a kiosk browser.

A browser device may declare deployment-owned `externalViews`, each with a name and absolute URL. These applications appear in the same Home Assistant View select as native Slatecast views. Slatecast presents the selected application in a full-panel frame. The receiver's frame-bound touch guard treats that frame as one target; the embedded application retains responsibility for its own finer-grained command safety.

The existing application-owned manifest mode remains available for a receiver dedicated to one application. A receiver that exposes its backlight through ESPHome sets `hasMqttBacklight: false`, so CastKit does not also advertise the kiosk-side MQTT backlight agent.

## Context

The first ESPHome receiver loaded one application's manifest directly. That proved the frame and touch transport, but it excluded the device from CastKit's normal view selection. A multi-purpose panel needs native Now Playing and Calendar views when its dedicated application does not need the panel.

## Why

The receiver remains generic, and Home Assistant continues to own view priority. External application URLs stay in private deployment configuration rather than public source. The standard Slatecast client reuses its existing music controls, calendar, weather, agenda, and WebSocket state. Matching the receiver MAC in CastKit and ESPHome also lets Home Assistant associate both integrations with one physical device.

## Evidence

> “Can we wire [it] like any other CastKit [display]?”

> “[It] should only turn on when [the room] is on; otherwise, it should be off like other CastKit [displays].”

Maintainer, 2026-09-10 remote-display integration conversation; workspace session `t3code-f475405b`.
