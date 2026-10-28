# Music queue reads down columns and keeps playback visible

Status: Accepted
Date: 2026-10-28
Type: Product and interaction
Supersedes: None
Superseded by: None

## Decision

Upcoming tracks in a compact multi-column queue read top to bottom, then continue
at the top of the next column. Each row has album artwork and plays its exact queue
item when selected, following the existing source readiness and control policy.
Unavailable rows remain disabled, and unsafe or failed artwork uses a placeholder.
Only complete rows use spare space; existing composition priorities still apply.

The compact and full player backgrounds use the active track's artwork color,
sharing the existing extraction and contrast policy. Song changes discard obsolete
color results. A seek handle appears on hover, keyboard focus, and drag (and on
touch displays); the waveform and progress fallback keep usable geometry.

Music Assistant may return no waveform while analysis is pending. Missing analysis
is retried on playback events at most once per 30 seconds for the current track.
Cached lyrics are retained. CastKit does not invent a waveform when none is available.

## Context

The initial compact queue read left to right, had no artwork, and could not start a
queued track. The full player already supported queue actions, color extraction,
and waveform rendering, but seeking had no visible handle. The source permanently
cached empty waveform analysis results for the track.

## Why

Match queue order and controls to how the list is read, reuse the existing Music
Assistant command path, and keep progress usable while real analysis loads.

## Evidence

Owner, T3 Code chat `53de286f-368c-46c7-826d-dab227ca4474`, 2026-10-28:

> Background changes to match the active song, make next songs clickable. Add album art to them. I'd expect the list to go top to bottom, not left it right.

> The waveform on the playback view when I click is missing for some reason. There's also no draggable indicator when trying to seek in the song while hovering the music timeline.
