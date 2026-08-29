# CastKit views retain rendering autonomy

Status: Accepted

Date: 2026-08-29

Type: Architecture

Supersedes: None

Superseded by: None

## Decision

CastKit is a custom dashboard and display interface. Its Admin UI is fully
Charcuterie. Its server uses Charcuterie's Hono layer where that shared layer
fits. Display-facing applications can use purpose-built server-side or static
rendering when a target display or small panel needs it. Charcuterie tokens are
an available shared resource, not a required visual implementation for those
views.

## Context

CastKit serves unusual panels, ePaper devices, kiosk browsers, and very small
display surfaces. The Admin UI benefits from standard shared components. The
server benefits from a shared Hono layer. Display views can need target-specific
layout, palette, static rendering, or server-side rendering. Browser-mode
display clients have a low RAM budget. Chromium runs inside the server only to
generate image-mode output.

## Why

The product is a custom dashboard and display interface. Its value includes the
ability to suit unusual display hardware. Charcuterie standardizes the
management UI and common server layer. Custom rendering preserves the freedom
that display-facing applications need. The low-RAM browser clients stay small,
and image rendering remains a server concern.

## Evidence

Owner direction in the current chat: "It's meant to be a custom dashboard/display
interface." The owner also stated: "The Admin UI is 100% Charcuterie though,
and the server layer, yes should be Charcuterie if it can to standardize on
Hono, but it will need some customization like server-side or static rendering
of apps." The owner also stated: "CastKit needs to keep browser RAM usage very
low. And in other places, it only uses an internal Chromium to generate images."
