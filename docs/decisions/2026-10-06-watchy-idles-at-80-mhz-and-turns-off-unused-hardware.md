# Watchy idles at 80 MHz and turns off unused hardware

**Status:** Accepted
**Date:** 2026-10-06
**Type:** Device power / owner preference
**Supersedes:** None
**Superseded by:** None

## Decision

The Watchy v3 package boots and draws at 80 MHz. A network wake (scheduled
sync, manual sync, or USB) holds an ESP-IDF power-management lock at 160 MHz
until Wi-Fi disconnects. Automatic light sleep stays off.

Hardware the firmware does not use is turned off rather than left in whatever
state the stock firmware set: the BMA423 accelerometer is soft-reset to its
suspend mode on every non-deep-sleep boot, and the vibration motor pin (GPIO17)
is driven low with an RTC pad hold that survives deep sleep. Re-enabling either
feature is a new decision.

Two diagnostic sensors report the average awake time of clock-only wakes and
of sync wakes, from application start to sleep entry, so later power work
compares measurements rather than estimates.

## Context

After the watchdog fix both watches still lost about 0.02 V per hour near
4.0 V, roughly 1 to 1.5 days per charge. The watch that syncs every ten minutes
drained almost as fast as the one that syncs every two minutes, so Wi-Fi was
not the only cost. ESPHome defaults the ESP32-S3 to 240 MHz. The stock SQFMI
firmware configures the BMA423 at 100 Hz continuous mode with step, tilt, and
wake features, and deep sleep never removes its power, so ESPHome inherited it.

## Why

Clock-only wakes run 1,440 times a day and need no speed. TLS and Wi-Fi setup
finish sooner at a higher clock, so only network work gets it. Unused
peripherals cost current all day for nothing.

## Evidence

Owner, 2026-10-06: "change the CPU speed and turn off the accelerometer,
vibration thing, etc. We're not using them atm." and "Can we bump CPU speed
only when connecting and bump it back down otherwise?"
Home Assistant voltage history for the 2026-10-06 overnight unplugged test:
the two-minute watch fell from 4.086 to 3.953 V and the ten-minute watch from
4.027 to 3.940 V between 02:20 and 08:20.
