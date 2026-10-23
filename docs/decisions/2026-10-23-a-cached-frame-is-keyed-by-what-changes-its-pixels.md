# A cached frame is keyed by what changes its pixels

- **Status:** Accepted
- **Date:** 2026-10-23
- **Type:** Performance and architecture
- **Supersedes:** item 1 (one entry per display) of [A request display's frame is rendered ahead into memory](2026-10-23-a-request-displays-frame-is-rendered-ahead-into-memory.md)
- **Superseded by:** None

## Decision

Every cache of rendered frames — request displays, update-display pushes, pre-rendered
image-stream frames and shared camera frames — is keyed by everything that changes the
frame's pixels and nothing else. Panels whose keys match share one render and one
buffer. The device ID enters a key only when the view resolves device-scoped content.
Caches are bounded, held in memory and never written to disk.

Image-stream navigation uses pre-rendered frames held by the server and, after
measurement, frame slots on the panel itself. The plan is
[`docs/2026-10-23-shared-frame-cache-plan.md`](../2026-10-23-shared-frame-cache-plan.md).

## Context

Several installations use the same panel model with the same properties and view list.
Each image-stream panel runs its own worker and browser, so a shared view is built,
captured and encoded once per panel, and a shared camera snapshot is processed once per
panel. The first request-display cache (#298) kept one entry per device, so two
identical devices would render the same picture twice.

## Why

A key that names the device where the pixels do not depend on it multiplies render
work and memory by the number of identical panels, and it cannot let one panel's render
serve another panel's swipe. A key that omits device-scoped content would show one
room's data on another room's panel. Memory-only storage avoids writes to the server's
SSDs for data that is cheap to rebuild.

## Evidence

Owner: "Many devices share the same screens on the same exact devices at the same
exact settings. We should make sure to dedupe our cached results based on that."

Owner, on memory: "We can keep those in memory. They don't have to be written to disk
necessarily."

Owner, on pre-rendered stream frames and panel frame slots: "Yes." and "Yes, we can do
this too."

Owner: "Where it's tough is when music's playing." and "Another thing shared are the
front door views. They have to receive images as a stream, so the quicker we can send
those video frames, the better."

Source: T3 Code CastKit memory conversation, 2026-10-23.
