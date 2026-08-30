# The Web UI is full configuration; HA MQTT is automation

- **Status:** Accepted
- **Date:** 2026-08-30
- **Type:** Product
- **Supersedes:** —
- **Superseded by:** —

## Decision

CastKit's Web UI is the complete configuration surface for a display. It owns
the hardware definition, including dimensions, renderer, colour capability,
shape, touch capability, and image-panel rotation. It also exposes every
per-display setting that Home Assistant can change through MQTT.

Home Assistant MQTT exposes the settings that a user can automate. It is not
required to expose the full hardware definition. The Web UI sends its shared
settings through the same MQTT command topics and retained state path as Home
Assistant. There is no second settings store.

## Context

The first device-management UI only edited the persistent hardware definition.
That made settings such as dithering, photo tuning, clock formatting, colour
processing, crop, and update pause available only from Home Assistant, while
hardware values were available only in the Web UI.

## Why

- The Web UI is the direct setup and maintenance interface.
- Home Assistant keeps the smaller automation-facing control surface.
- One MQTT path keeps state, validation, live application, and retained
  persistence consistent regardless of which interface changes a setting.

## Evidence

> "MQTT/HA is for stuff I wanna automate, the Web UI is for the full config."

— maintainer, chat (2026-08-30)
