# Device management uses a list and editor

Status: Accepted
Date: 2026-08-27
Type: UI
Supersedes: None
Superseded by: None

## Decision

The CastKit device-management surface uses a device list beside the selected-device editor.

The editor is the place to create, change, and delete a device definition. The interface
also shows the matching Home Assistant MQTT-discovery configuration.

## Context

CastKit device definitions currently come from a configuration file. The owner needs a
graphic surface that is faster to manage than the Home Assistant configuration pages while
keeping the settings usable in Home Assistant automations.

Two layouts were previewed: a card grid with a detail route, and a list with an editor.

## Why

The list keeps the active device visible while the owner makes repeated edits.

## Evidence

Owner, chat 2026-08-27: "B seems a lot better"
