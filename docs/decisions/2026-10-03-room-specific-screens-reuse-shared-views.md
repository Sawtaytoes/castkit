# Room-specific screens reuse shared views

- **Status:** Accepted
- **Date:** 2026-10-03
- **Type:** Product / Architecture
- **Supersedes:** —
- **Superseded by:** —

## Decision

Use a shared saved view for the same presentation across rooms. Room-specific destinations are screens; do not duplicate a view solely to create a room-specific destination.

A migration must preserve the intended scan routing and reader isolation. The current implementation binds channels to views, and the existing room-specific scan automations refer to those views by ID. Move the room context and update its consumers before removing the duplicate views. This decision records the required architecture; screen-specific channel bindings and parity with device-page gestures remain implementation work.

Keep physical installations on their existing device pages until screens provide their complete interaction and automatic selection behavior.

## Context

The owner found multiple copies of the same tally presentation and an apparently ineffective Delete action. Assigned views cannot be deleted while a screen still references them; mobile error feedback was outside the visible area.

## Why

A presentation should be maintained once. A stable screen represents the place where that presentation is used and the views that destination can select. A cleanup must preserve functioning scan feedback and physical-display interactions.

## Evidence

Owner, current T3 Code conversation on 2026-10-03 (thread identifier unavailable): “We need separate screens, not views, and the screens are room specific.” The owner also described the tally copies as “Unnecessary since they're literally all the same.”
