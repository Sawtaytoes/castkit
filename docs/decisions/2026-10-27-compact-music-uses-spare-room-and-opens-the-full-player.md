# Compact music uses spare room and opens the full player

Status: Accepted
Date: 2026-10-27
Type: Product and layout
Supersedes: None
Superseded by: None

## Decision

The Music Player offers a compact presentation for combined overviews. Artwork,
track title and artist, and Previous/Play/Pause/Next controls come first within
its allocated card. Only complete upcoming queue rows use the height left over;
the queue is the lowest-priority content. Compact music defaults below printer,
disc and AI usage content. The existing composition scorer may omit the card
when higher-priority content cannot otherwise fit, while persistent points keep
their reserved summary space.

Selecting the artwork or track details opens the existing full Music Player with
its queue. This navigation recalculates the composition and uses the existing
reflow animation. The full player takes its readable width before supporting AI
usage. Back restores the overview and its priorities. Paused tracks remain
available in compact cards so pausing does not remove the way to resume.

This is a view presentation setting, available in CastKit management; it neither
identifies an installation nor changes the source channel or action binding.

## Context

A combined overview can use a small music card without devoting the full player
and queue's footprint to background listening. Its available room changes as
other work starts and stops.

## Why

Keep the overview's primary tasks readable, while allowing deliberate navigation
to make music the active task. Queue details spend spare space rather than
shrinking essential facts or introducing partial rows.

## Evidence

Owner request, T3 Code chat `53de286f-368c-46c7-826d-dab227ca4474`, 2026-10-27:

> When I click it, go to the full view with queue.

> Most of it is lower priority, but if we have room, we can show the queue (lowest priority)

Browser coverage exercises complete-row fitting, transport action routing,
composition expansion and return, and paused-track retention. The real-server
Playwright harness uses an anonymized adaptive composition with the same saved
item selections, in all four browser windows plus the 1024×600 target.
