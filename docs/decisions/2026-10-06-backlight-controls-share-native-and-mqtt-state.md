# Backlight controls share native and MQTT state

- **Status:** Accepted
- **Date:** 2026-10-06
- **Type:** Device control contract
- **Supersedes:** [2026-09-11](2026-09-11-castkit-owns-the-backlight-level-and-restores-it-on-reconnect.md), only its restrictions on management power controls and backlights without an external MQTT agent
- **Superseded by:** —

## Decision

CastKit offers brightness and On/Off for every configured backlight. Its native
device controller remains usable without a broker. Configuring a broker adds
the Home Assistant automation surface to those same controls; it does not
replace the native device transport.

Native controllers reuse the existing `backlight/set`, `backlight/brightness/set`
and `backlight_level/set` command topics and light/number discovery identities.
They persist the chosen brightness and power in the platform store, publish
retained light and brightness state at startup and on changes, and serve the
same effective brightness through the hardware controls endpoint. Native light
availability follows the CastKit server; external agent lights keep their own
availability contract.

MQTT commands update the same native controller. A light Off or zero-brightness
command retains the chosen nonzero brightness for a later On. A positive light
brightness command turns it on. Power commands override an optional CastKit
room-following policy. Updating the chosen level through CastKit's management
API does not change the power mode. Native MQTT state is a mirror, so subscribing
to an old retained state value cannot overwrite newer disk-backed settings.

CastKit room following is optional. An installation may use its existing Home
Assistant light automations instead. Neither option is required to operate the
manual CastKit controls.

External MQTT agents keep their existing brightness and reconnect contracts.
Management On/Off sends the same power commands Home Assistant already uses and
reads the agent's state. No native controller impersonates an external agent,
and mirrored state is never republished as a command.

## Context

A native brightness controller initially worked independently of MQTT, but
offered a transport choice that made direct controls and automation controls
appear mutually exclusive. The owner expects both clients to control the same
backlight.

## Why

Persisting native settings before asynchronous MQTT publication keeps local
hardware control responsive while a broker is disconnected. Reusing discovery
identities and topics preserves existing automation compatibility and prevents
two competing backlight entities for one panel.

## Evidence

- Owner: "Whatever we configure in CastKit needs to be pushed over MQTT and on
  the device."
- Owner: "Home Assistant should still be able to control this as well."
- Thread: `fc07df05-c195-437a-b4f0-a2829da14443`.
- Regression coverage: native startup state, both command sources, device
  endpoint agreement, brightness restoration, optional room-source changes,
  legacy agent power, and a broker that never acknowledges publication.
