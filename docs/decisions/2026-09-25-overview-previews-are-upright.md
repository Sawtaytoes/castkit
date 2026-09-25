# Overview previews are upright

Status: Accepted
Date: 2026-09-25
Type: UI / preference
Supersedes: None
Superseded by: None

## Decision

Add an All screens page to management. Show physical devices and independent named browser screens together. The overview compensates for output rotation so people see readable content. A screen assigned to a physical device is represented by that device rather than duplicated as a browser screen.

The device editor offers Upright and Device output preview modes. Upright compensates for the effective rendered rotation. Device output preserves the emitted pixels for installation checks. Changing this presentation does not save a setting, rotate hardware, or send commands. Image previews use the rotation captured at render start, including runtime overrides, and their actual image dimensions. Browser previews report their current output orientation to the same-origin parent.

The existing focused tabs remain the editing surface. Integrate with the current management navigation, PIN access, named screens, and screen assignments. Do not replace the independent platform work.

## Context

The owner requested readable previews of a physically rotated display and an optional raw-output inspection mode. The parallel platform effort added reusable views and named browser screens while the management redesign was in review. Its new access and navigation surfaces must be retained.

## Why

Installation rotation is a delivery setting, not a requirement for the person who checks the overview. The two preview modes support monitoring and setup without changing a working installation.

## Evidence

Owner, T3 Code thread `f7996252-1b64-4f10-85c8-9feb526f3783`, 2026-09-25:

> "No reason to show the view upside down."

> "there should also be an option there to view it normal rotation vs rotating it to look like it does on the screen itself"

The owner also requested an overview suitable for a kiosk and asked to check the other agent's work. That agent's platform work provides view and screen infrastructure. A dedicated overview as a selectable kiosk view remains a follow-up; this change supplies the management overview.

## Related

- [Focused management tabs](2026-09-24-management-uses-focused-tabs-and-a-display-preview.md)
- [Named channels and extensions](2026-09-25-named-channels-and-extensions-drive-reusable-views.md)
