# The artwork is a control: a tap toggles play, a drag changes track

- **Status:** Accepted
- **Date:** 2026-09-10
- **Type:** Interaction
- **Supersedes:** —
- **Superseded by:** —

## Decision

On a touch device the Now Playing artwork is a button, not a picture.

- A **tap** toggles play and pause. It sends the same `play_pause` command the
  transport button sends; nothing else changes.
- A **drag** slides a three-cell rail — previous, current, next — behind a fixed
  window. The card follows the finger through a `tanh` rubber band, so it slows
  as it travels and can never leave the panel. Releasing past 32% of the
  artwork's width sends `next` (dragged left) or `previous` (dragged right).
  Bringing it back towards the middle and releasing there cancels.
- While the finger is down and has passed an 8-pixel slop band, a pill at the
  top of the panel names the direction: **Next Song** or **Previous Song**. It
  changes colour once the release would act, so the panel can say "let go now"
  without any other affordance.
- The **next** side names the track. The **previous** side does not.
- A touchless device is unchanged: a plain `<img class="artwork">`, no button,
  no gesture, no rail.

The spring back to the middle is inside `prefers-reduced-motion: no-preference`,
so a panel driven by the remote-display renderer — which asks for reduced motion
— snaps rather than animates.

## Context

The owner asked for it in these words:

> Can we make it so clicking the thumbnail image also pauses and unpauses? Same
> for the square screen.
>
> It'd also be neat if physically dragging the thumbnail left or right showed the
> next-in-line song and allowed you to play that, but I think seeing the queue
> requires MA connection, and we only have HA via MQTT for this; wait, I think we
> _do_ have the queue because we have a Queue view available I thought.
>
> If not, have dragging left or right slide the thumbnail with a bit of
> elasticity and change the UI at the top to say "Previous Song" or "Next Song",
> so the user's aware of what's going on. Moving it back to the center area
> cancels.

He was half right about the queue, and the half that is wrong is the reason the
two sides of the gesture are not symmetric. The `queue` topic, the `QueueData`
type and the `Queue` view have always existed; nothing was publishing to them.
Home Assistant can now fill them, but only with what its Music Assistant
integration exposes: `music_assistant.get_queue` returns the **current** item and
the **next** item, and nothing before the current one. There is no service that
returns the list.

So `nextQueueItem` derives the next track from the queue and there is
deliberately no `previousQueueItem` to match. A queue with no item marked
current returns no next either — guessing the first row would name the wrong
track on the pill.

## Why

The artwork is the biggest thing on the panel and the thing a hand reaches for.
The transport buttons are 6vmin glyphs on a 480x320 display; the artwork is
42vmin. Making the picture the primary control costs no space and no new
affordance.

The drag is one gesture doing two jobs — it changes track, and while it is held
it answers "what is next?" without a separate view. That matters on a panel with
no keyboard and no room for a queue list.

The pill is the whole reason this is safe on a kiosk: a drag with no feedback is
indistinguishable from a slipped tap, and a tap that silently skipped a track
would be worse than no gesture at all. It names the direction, it names the next
track when that is knowable, and it changes colour at the commit point.

Only the next side carries a name because the alternative was inventing one. The
client could remember the track that played before the current one, but Music
Assistant's `previous` goes to the queue index below the current one, which is
not the same thing under shuffle or after a manual jump. A label that is always
true beats a title that is usually true.

## Evidence

Ten tests in `packages/slatecast/src/views/NowPlaying.test.tsx`, all driving real
pointer events in real Chromium:

- a tap toggles play and pause
- a nudge inside the slop band is still a tap, and shows no pill
- a drag left past the commit distance plays the next track
- a drag right past the commit distance plays the previous track
- a drag back to the middle publishes nothing
- a drag that never reaches the commit distance publishes nothing
- the pill names the next track and reads armed while dragging left
- the pill labels the previous side and names no track
- the next cell carries the next track's artwork
- a touchless device renders a plain picture and no gesture target

Before and after captures of both touch panels are on the pull request. The
resting view is pixel-identical to the previous build; the gesture is only
visible while a finger is down.
