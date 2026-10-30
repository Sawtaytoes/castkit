# Music seek previews and room pause grace

Status: Accepted
Date: 2026-10-29
Type: Interaction
Supersedes: Idle dashboard paused/stopped eligibility in 2026-10-28-compact-music-uses-wide-space-and-yields-to-work.md
Superseded by: None

## Decision

The music waveform uses a pointer cursor. Hovering or dragging shows the target
boundary and time, with a lighter interval between actual playback and the target.
Playback keeps its own accent color. A drag updates the target and commits one
seek on release. The plain progress fallback offers the same preview.

Room Overview retains current music for one minute after playback pauses or
becomes idle. Some grouped players report a pause as idle. Repeated reports do
not extend the minute; resumed playback starts a new listening period. Missing
tracks and unavailable players hide immediately. This changes only Room Overview,
not other displays' existing paused-music policies.

## Context

The waveform had a resize cursor and a time tooltip without a waveform preview.
Room Overview immediately removed grouped music when a pause reported idle.

## Why

The pointer and a distinct preview make an exact seek easier to select. A short
pause keeps the controls available for resuming, then returns the overview space.

## Evidence

The owner requested a finger pointer and a lighter or darker hover color distinct
from playback, and a one-minute pause grace on the 1024×600 overview. Chromium
interaction coverage checks forward/backward preview, one release action, the
59/60-second boundary, repeated idle reports, and resumed playback.
