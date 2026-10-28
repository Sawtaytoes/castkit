# Compact music uses wide space and yields to work

Status: Accepted
Date: 2026-10-28
Type: Product and layout
Supersedes: The height-only queue fitting in 2026-10-27-compact-music-uses-spare-room-and-opens-the-full-player.md
Superseded by: None

## Decision

Compact Music Player adapts to its allocated width and height. A wide card puts
larger artwork, track details and transport beside a queue, with multiple queue
columns where complete items fit. A narrow allocation stacks the player and queue.
The composition prefers a useful wide player after higher-priority facts fit;
printing and other competing work can reclaim that width automatically. The queue
remains lower priority than the player and every other displayed section.

The shared fit calculation drives both composition scoring and rendered queue
capacity. Only complete queue items count. Short wide strips retain compact chrome;
taller cards enlarge artwork and text without forcing more space from other facts.

Idle dashboard accepts an optional Music Player channel. Music uses spare space in
the agenda column; clock and points keep their existing allocation. When the visible
agenda cannot leave room for compact controls, music yields. Selecting it opens the
full player and queue; Back and return-to-time navigation restore the overview.

Music actions target that optional input explicitly. Source readiness and existing
view controls govern transport independently of agenda, weather or points freshness.
Existing views without a music binding retain their behavior. Playing and paused
current tracks qualify; stopped/idle and missing-current states do not.

## Context

The first compact presentation occupied a wide card with fixed small artwork and a
vertical queue, leaving most of its width unused. A rendered comparison at 1024×600
showed a wide player with queue beside it and a narrower alternative.

## Why

Allocated space must improve the displayed information. Counting height alone misses
room for queue columns and makes a large rectangle look empty. The main overview's
work remains primary, while optional music adapts to the room it actually receives.

## Evidence

Owner, T3 Code chat `53de286f-368c-46c7-826d-dab227ca4474`:

> Fill that space if you're gonna do that.

On 2026-10-28, selected:

> A — fill the width (Recommended)

And clarified:

> We could also use B if there's higher priority stuff like 3D printing going on.

The existing [compact navigation and priority decision](2026-10-27-compact-music-uses-spare-room-and-opens-the-full-player.md)
continues to apply. Browser and real-server coverage exercise wide/narrow switching,
complete queue items, optional-input action routing, source/control guards, agenda
competition and full-player/child-detail return paths.
