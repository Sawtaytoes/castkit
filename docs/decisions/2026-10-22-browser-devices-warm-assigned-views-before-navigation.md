# Browser devices warm assigned views before navigation

Status: Accepted
Date: 2026-10-22
Type: Performance and interaction
Supersedes: None
Superseded by: None

## Decision

Browser devices and the browser renderers serving image-stream devices prepare
their configured local CastKit views in the background.
A warm composition draws from memory immediately and opens its live subscription
directly, without another HTTP bootstrap. Prepare both ordinary links and their
device-context variants: automation-selected targets carry that context. The
preparation API accepts only configured local views or assigned screen members,
retains PIN checks, and never enables actions. Cache entries use the request
identity even when a legacy wire snapshot omits its device ID. The new subscription must confirm access
and current data before controls become available. Loading feedback and animations
remain available for cold or unavailable targets.

Keep preparation bounded: eight compositions, a one-minute expiry, sequential
background refreshes, and at most four static images per composition. Do not keep
hidden pages, extra sockets, video streams, or camera feeds running. Single-frame captures do not need background preparation.

Deferred dashboards retain their resolved component so a remount does not show
another loading placeholder for code that is already present. Access changes clear
the memory cache and invalidate outstanding warm-up responses. No private data is
persisted to disk or a service worker.

## Context

Input feedback addressed uncertainty but did not resolve slow navigation on a small
browser device. CastKit already knows its assigned local targets, yet every switch
repeated a bootstrap request and live connection setup. A repeat visit also rebuilt
the view. Main view code was already bundled; merely downloading that bundle again
would not prepare the composition or its media.

## Why

Preparation removes avoidable work from the gesture path while keeping live data,
permissions, and the renderer's memory budget explicit. It does not establish that
all rendering latency has been resolved; verify responsiveness on the actual device.

## Evidence

Owner feedback: "Feedback works, but still slow."

Owner proposal: "Everything is at CastKit, so we already know what pages to load."
And: "Maybe we can create a custom lazy-loaded page of all the assets, so they're
always there ready to go as soon as we switch screens."

Owner scope clarification: "This loading issue also affects the ESP32 devices.
I want everything to feel near-instant speed."

Source: T3 Code navigation performance conversation, 2026-10-22.
