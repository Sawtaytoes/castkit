# Ambient LEDs have independent shared controls

Status: Accepted
Date: 2026-10-06
Type: Product behavior
Supersedes: None
Superseded by: None

## Decision

Supporting displays expose rear ambient LEDs as an independent native capability.
CastKit persists power, remembered brightness, one of five effects and demo preview
per device. All controls are available in management without MQTT or Home Assistant.
An optional standard MQTT light mirrors the same persisted controller, with brightness
and an effect list; commands from either surface reach the receiver's controls endpoint.

## Context

The display backlight and ambient LEDs serve different purposes. Trying an LED effect
must not change the display backlight, room policy or media playback.

## Why

A single persisted controller keeps management, automation and device state consistent.
A receiver can use live track, weather and calendar data when available and explicit
sample data for previews. Missing live data cannot masquerade as progress or a meeting.

## Evidence

The requested effect set is album glow, swipe comet, meeting fuse, weather aura and
progress bar, reusable across supporting devices. The default is off with 5% remembered
brightness. Contract and controller tests cover persistence, MQTT mirroring and separate
backlight state; management tests exercise immediate controls in four browser windows.
