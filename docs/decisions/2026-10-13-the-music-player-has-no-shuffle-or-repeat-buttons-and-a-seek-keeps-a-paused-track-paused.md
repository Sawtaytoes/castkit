# The Music Player has no shuffle or repeat buttons, and a seek keeps a paused track paused

Status: Accepted
Date: 2026-10-13
Type: View behavior
Supersedes: None
Superseded by: None

## Decision

The Music Player's transport row is Favorite, Previous, Play/Pause, and Next. It draws no shuffle and no repeat button. The `music-player.v1` contract keeps `isShuffled` and `repeat`, and the Music Assistant source keeps the `shuffle` and `repeat` actions, so another client or the API can still use them.

Play/Pause is enabled whenever control is enabled and a player is selected, with or without a queue. A player with no queue is played and paused through Music Assistant's `players/cmd/play_pause`. The source does not remember a queue lookup that returned no queue; the next sync asks again.

A seek on a queue that is not playing leaves it paused. Music Assistant's `player_queues/seek` always restarts the stream through `play_index`, and Music Assistant has no seek that stays paused, so the source sends `player_queues/pause` straight after the seek when the queue was not playing.

## Context

The owner asked for the shuffle and repeat buttons to go, reported that Play stayed disabled until playback had been started from Music Assistant, and reported that a seek on a paused track started playback. The Play defect came from caching an empty `player_queues/get_active_queue` answer under a key that changes only when the player's source does.

## Why

Repeat is never used, and shuffle is handled by Music Assistant. Two fewer buttons leave the transport row readable on a 1024 x 600 display. A seek is a position change, not a play request; a paused listener expects the track to stay paused.

## Evidence

The owner, 2026-10-13: "I don't need repeat controls. I never use them. Shuffle is fine, but it does that for you. Not necessary here." And: "If I click the seek timer, it immediately starts playing. If I'm playing already, that's fine. If I'm paused/stopped, don't play if I seek."

Music Assistant source at `music_assistant/controllers/player_queues/controller.py` (commit bf4d5b9): `seek` calls `play_index(queue_id, queue.current_index, seek_position=position)`, and no `player_queues/*` command sets a position without playing. `players/cmd/play_pause` takes `player_id` (`music_assistant/controllers/players/controller.py`).
