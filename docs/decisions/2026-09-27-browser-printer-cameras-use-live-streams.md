# Browser printer cameras use live streams

- **Status:** Accepted
- **Date:** 2026-09-27
- **Type:** Product behavior / camera transport
- **Supersedes:** —
- **Superseded by:** —

## Decision

A browser-rendered printer view fed by the direct Bambuddy source uses the live MJPEG camera stream. It does not repeatedly request still JPEGs. CastKit proxies the stream through its display-scoped media route, keeping the Bambuddy camera token and printer connection details on the server. The image renderer may continue to use still pictures where the display cannot render video.

## Context

The direct source exposed Bambuddy's snapshot endpoint as the printer's camera path. The browser refreshed the image every ten seconds, which made an active print look like a slide show. Bambuddy already serves an MJPEG stream, and the browser camera component already supports a live source.

## Why

The browser can hold a stream and draw frames as they arrive. A ten-second still image hides short events during a print. The proxy keeps source credentials out of the browser and lets the same view run under the display's access policy.

## Evidence

Owner, T3 Code chat `t3code-a82ba385`, 2026-09-27:

> can we make it the full video stream rather than an image? the olny time you'd need it slow is when streaming images. But not right now
