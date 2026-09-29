# A paused track stays in an active-only view for ten minutes

- **Status:** Accepted
- **Date:** 2026-09-29
- **Type:** product / composition model
- **Supersedes:** [An active-only view shows only what is going on](2026-09-28-an-active-only-view-shows-only-what-is-going-on.md), for the music clause only ("music while `isPlaying`"). Everything else in that record stands.
- **Superseded by:** —

## Decision

1. **A now-playing channel is active while it plays, and for ten minutes after
   it really stops** (`PAUSED_ACTIVE_SECONDS`), as long as the payload still
   names a track (a title or an artist). A pause no longer hides the music
   panel of an active-only view, and the tab's dot stays with it.
2. **A stop counts only after thirty seconds of playback**
   (`MINIMUM_PLAY_SECONDS`). A shorter spell neither starts nor restarts the
   ten minutes, so a spoken announcement on the same speaker cannot keep an
   idle panel on the glass or cut a real pause short.
3. **The server times the stop** (`pausedMusic.ts`), from the transitions the
   channel hub already sees, and re-sends every snapshot when the ten minutes
   end, so the panel leaves without waiting for new data.
4. **Nothing is persisted.** After a restart the last stop is unknown and the
   panel reads as idle until the music plays again.

## Context

The owner's rule for a paused track is that it stays on the glass, so it can
be resumed from there, and the room is given back after ten minutes of quiet.
The per-device panels already follow it: Home Assistant decides their view and
holds Now Playing for ten minutes after a pause.

The active-only view added on 2026-09-28 answered music activity from
`isPlaying` alone. A pause sets that to false, so the music panel was hidden at
once. A pause cannot be told apart from a stop in one snapshot either: a Music
Assistant sync group has no pause feature, turns a pause into a stop, and the
publisher then sends the queued track with `isPlaying: false`. So the answer has
to come from time, not from one payload.

## Why

- **Timed on the server, beside the activity answer.** The server already
  answers activity for every view on a screen; the client holds only the
  current view's channels and cannot answer for the tabs.
- **A thirty-second floor, not a debounce.** Announcements read as one to three
  seconds of playback, and real listening as minutes, so thirty seconds
  separates them with a wide margin both ways. Counting every false-to-true
  flip would let each announcement restart the ten minutes.
- **A track must still be named.** A cleared queue publishes an empty card, and
  an empty card has nothing to resume.
- **In memory, not on disk.** Wrongly reading an idle room as idle after a
  restart is the safe mistake; persisting a timestamp would add a write on
  every playback change for a case that ends on its own within ten minutes.

## Evidence

Owner, 2026-09-29: *"It still hides immediately when I pause. It didn't for a
while after your change, but then it came back after some other CastKit
changes. Big regression. It should keep that view open for X seconds that we
noted until it ends up going away. But it's supposed to keep the paused song on
screen until I unpause it."* The X is the ten minutes the owner set on
2026-09-11 for the per-device panels.

Tests: `pausedMusic.test.ts` (ten minutes, a re-sent paused card, an
announcement burst, a restart, the expiry re-send), `viewActivity.test.ts` (a
paused track with and without a recent stop, and with no track), and
`platform.test.ts` (a real display snapshot through a pause, active at nine
minutes and idle at ten; it fails without this change).
