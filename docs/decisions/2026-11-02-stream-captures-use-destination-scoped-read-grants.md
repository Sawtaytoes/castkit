# Stream captures use destination-scoped read grants

Status: Accepted
Date: 2026-11-02
Type: Architecture
Supersedes: None
Superseded by: None

## Context

An image-stream capture runs on the server's loopback origin and can prepare
a local saved composition before the device selects it. Public navigation
URLs can have another origin, and the normal foreground assignment check
correctly rejects an unselected destination. Native snapshot data alone does
not identify a device-customized composition's pixels.

## Decision

Resolve local composition destinations before native frame handling. Include
their effective view, bindings, channel data, and display properties in frame
identity, and track their channel dependencies. Configuration and screen
selection changes also invalidate prepared destinations.

Put the resolved target in the capture's device snapshot. Its temporary token
grants reads of only that device and target while the capture exists. Carry
the token through scoped media and HLS children. Keep view and screen PIN
checks, and reject capture requests that change data or select another view.
Captures load one composition without live subscriptions or background warm-up.

Do not prepare compositions that require a PIN or administrator-only controls
in the shared frame cache. A separate capture context cannot inherit the
worker's access session. Other external applications have no native frame
identity and are not cached as native views.

Multi-view screens also use the worker's normal capture. Their inactive tabs
draw names and activity from other compositions, which the current platform
frame key does not describe. Activity expiry invalidates listening caches even
when no channel payload or configuration record changes.

## Why

A capture needs enough context to render the intended future destination and
its controls. It does not need administrative credentials or permission to
change the device. Keys and invalidation must describe the content actually
rendered so different device inputs cannot share a frame accidentally.

## Evidence

Server tests exercise capture scope, PIN preservation, rejected actions and
screen changes, token expiry, HLS children, distinct local-variant frame keys,
and channel invalidation. Browser tests exercise a frozen token capture. The
real-server device-variant scenario compares prepared PNGs with the worker's
own capture before and after a bound-channel update and checks that changing
access to PIN removes the prepared composition.
