# Remote displays read an app-owned manifest

- **Status:** Accepted
- **Date:** 2026-09-08
- **Type:** Architecture / Rendering
- **Supersedes:** —
- **Superseded by:** —

## Decision

Add a generic remote-browser renderer worker within CastKit's device clients. The source application owns every page, including cached loading views, and serves a versioned JSON manifest describing its URLs, viewport, cache selectors, touch identity attribute, and refresh limits. CastKit knows no application domain objects or commands. The WT32 receiver uses compressed RGB565 frames over encrypted ESPHome API actions, with a local circular touch marker and one optimistic bitmap in PSRAM.

## Context

A color LCD needs faster interaction than the existing ePaper render/pull path. The browser must run on the host, while the display reports touches and shows pixels. The renderer worker is packaged independently for its Python/Chromium dependencies; it exposes no second server and does not create a separate product or application view system. Central registry/HA discovery management is not part of this receiver's initial implementation.

## Why

The manifest prevents application templates and business rules from being duplicated in CastKit. The receiver can acknowledge a tap locally before the rendered page arrives. Frame identities bind touches to the controls actually displayed, and the daemon behind the application remains responsible for command safety. Existing ESP32 ePaper token URLs and existing Inkcast/Slatecast modes remain applicable to their current devices.

## Evidence

> “We should have a CastKit-compatible JSON metadata file for how to cache and handle things and which URLs to load as part of the images.”

> “I like showing the touch area when clicking. Just make it a circle, not a square”

Maintainer, 2026-09-08 WT32 kiosk conversation; workspace session `t3code-fdde648d`.
