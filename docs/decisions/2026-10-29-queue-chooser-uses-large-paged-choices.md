# Queue chooser uses large paged choices

- **Status:** Accepted
- **Date:** 2026-10-29
- **Type:** Product and interaction
- **Supersedes:** None
- **Superseded by:** None

## Decision

On a 480×480 task display, use 34px queue titles in 88px buttons, 28px selected
people, a 32px heading, and clearly separated controls. Two complete queue choices
fit per page with two selected people. Additional queues remain reachable through
Previous and Next. Measure the available list height against the rendered row
height and gap; do not assume a fixed number of rows on other display sizes.

A single queue chooser on a device uses the available face without a second card
frame. Short compositions reduce secondary text and row height to keep controls
reachable. Many selected people stay in their bounded scrolling region. Long
names and queue titles truncate within their controls.

Selected people use QueuePilot's owned photos via optional versioned `artworkPath`
metadata and CastKit's existing authorized media proxy. Match Charcuterie's
ID-colored initials fallback for absent or broken photos, without importing its
React component runtime into Preact. Keep one visible 64px row of people; additional
rows use the native display's vertical scroll support. Play icons precede queue
labels, and one status line distinguishes load errors from an empty match.

Keep scanning, selection validation, action identity, removal, reset, close,
inactivity renewal, and automatic return unchanged. Scanning a person does not
start playback; selecting a queue does.

## Context

The scan flow worked, but its display text was too small and its people controls
omitted QueuePilot's existing photos. Shared platform button styles also overrode
the chooser's intended sizes in the device shell.

## Why

Keep the primary choices easy to read and tap on a small task display, recognize
people by their existing photos, and preserve complete rows and existing controls.
Reuse Charcuterie's visual conventions and CastKit's media and native-input paths.

## Evidence

The maintainer reported that the working scan UI was too small on its screen,
then accepted a 480×480 comparison with two larger choices per page. The accepted
concept and implementation use fictional fixture identities in public evidence.
The actual placement and physical readability still require installation review;
pixel fit alone does not establish physical readability.

[Before-and-after comparison](../previews/2026-10-29-queue-chooser.html) uses the real
device-page harness with fictional people and queues.
