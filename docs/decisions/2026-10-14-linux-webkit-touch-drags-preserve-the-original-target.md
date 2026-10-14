# Linux WebKit touch drags preserve the original target

Status: Accepted
Date: 2026-10-14
Type: Browser compatibility
Supersedes: None
Superseded by: None

## Decision

On Linux WebKit, adapt touch contacts into the existing pointer handlers while preserving each contact's original DOM target through movement and release. Keep mouse events and native form controls on their normal path. Native Now Playing volume remains on its custom pointer path; saved Music Player range inputs retain native touch behavior. Suppress duplicate native touch pointers, premature pointer cancellation and compatibility clicks for dragged or cancelled contacts.

## Context

WPE WebKit 2.48.3 with Cog 0.18.4 on Wayland accepted `setPointerCapture`, but moved pointer events to the element underneath a dragging finger once it left a narrow edge. It then sent pointer cancellation and released over that other element. Touch events continued to identify the original target. Five-position tap calibration passed while side pulls failed, so aligned taps alone did not qualify dragging.

## Why

The existing drawer, seek, volume and artwork controls already implement pointer interactions. A browser compatibility adapter keeps one set of gesture handlers and avoids adding a second browser framework or changing navigation. Ordinary Chromium and non-Linux Safari are not selected for this compatibility path.

## Evidence

On-device remote-inspector observation and generated Linux touch input reproduced pointer retargeting during an inward edge pull. The same generated pull opens the drawer with the adapter. Regression tests reproduce retargeted movement and premature cancellation, check one seek at release, preserve native range input and prevent cancelled clicks. Browser tests run in all four standard window sizes.

The application declares Preact for the live browser client; React is used elsewhere for server/static rendering. This interaction failure was observed in input delivery, not inferred from framework choice or HDMI refresh rate.
