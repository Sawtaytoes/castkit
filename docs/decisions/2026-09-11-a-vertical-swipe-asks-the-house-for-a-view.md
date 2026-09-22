# A vertical swipe asks the house for a view

- **Status:** Accepted
- **Date:** 2026-09-11
- **Type:** Interaction
- **Supersedes:** —
- **Superseded by:** [A touch panel opens its view drawer from either screen edge](2026-09-21-a-touch-panel-opens-its-view-drawer-from-either-screen-edge.md), for direct view navigation and the external-view exit

## Decision

On a touch device a vertical swipe anywhere on the stage reveals a view.

- **Swipe down** asks for **Now Playing**.
- **Swipe up** asks for **Calendar**.
- The commit distance is 48 pixels, and the travel must be more vertical than
  horizontal. Anything else is not a swipe.
- A swipe towards the view already on the panel is still sent. It is how the
  owner says "I am still looking at this".

The panel does **not** switch views by itself. It publishes
`{ action: "view", value: "<clientId>" }` on the command topic, exactly like a
tap, and Home Assistant decides what to show. A new `view` action joins
`play_pause`, `next`, `previous`, `seek`, `volume_set` and `volume_mute`; it is
the first command whose `value` is a string, so `parseDeviceCommand` now takes
`number | string` and checks the type per action.

Two consequences follow from where the handler sits:

1. The gesture is on the **stage**, not inside a view, because a gesture that
   replaces a view cannot live in the view it replaces.
2. An **external view** is an `<iframe>` of somebody else's application, so the
   swipe does not reach it. A panel showing the Rip Deck kiosk has no view
   swipe until Home Assistant sends it back to a native view.

A touchless device is unchanged. The handlers are attached on
`profile.hasTouch`, so a mouse cannot make a gesture a mouse cannot make.

## Context

The owner asked for it in these words:

> If music assistant has a queue, and It's been paused for 10m, go back to
> displaying the time/agenda, whatever, but allow swiping down or whatever to
> bring up the "Now Playing" view if that device support it. For Swipe up, it
> could show the agenda view if it's currently hidden. Non-touch decides are
> unaffected

The house rule he is changing lives in Home Assistant, not here: a display held
Now Playing for as long as the Music Assistant queue held an item, so a queue
paused overnight kept the agenda off the panel until morning. Home Assistant now
gives that up after ten minutes and needs a way back. This is that way back.

The artwork on the Now Playing view is already a control — a tap toggles play, a
horizontal drag changes track. A swipe up to the agenda starts on the artwork as
often as not, so the two gestures share a finger and had to be told apart.

## Why

**The house owns the view, not the panel.** Every other control on these panels
is already a request to Home Assistant rather than a local action, and the view
rule is an automation with a tower-priority branch, a queue read and a timed
hold. A panel that switched views locally would be a second rule that can
disagree with the first, and the panel would win whichever one was wrong.

**Vertical, because horizontal is taken.** The artwork's left and right drag
changes track. Requiring `|dy| > |dx|` past a 48-pixel commit keeps a clumsy
track change from also changing the view.

**The artwork stands down rather than the stage giving way.** A pointer's moves
all arrive before its release, and every move bubbles from the artwork up to the
stage, so by the time the artwork is asked whether its release was a tap, the
stage has already decided. The artwork reads one signal and returns. Without it
a swipe up to the agenda would also stop the music.

**48 pixels.** The shortest panel in the fleet is 320 pixels tall, so this is
about 15% of its height: past a resting finger, inside one thumb's reach.

**`touch-action: none` on the stage**, or the browser claims the gesture before
a `pointermove` is delivered. The queue view scrolls, so it keeps `pan-y` and
reading a long queue beats revealing another view.

## Evidence

Seven tests in `packages/slatecast/src/viewSwipe.test.tsx`, driving real pointer
events in real Chromium:

- swiping down asks for `now-playing`
- swiping up asks for `calendar`
- a swipe towards the view already up is still sent
- a drag shorter than the commit distance publishes nothing
- a mostly sideways drag publishes nothing
- a touchless device publishes nothing
- a swipe that starts on the artwork asks for the view and does **not** also
  send `play_pause`

Four more in `packages/shared/src/protocol/commands.test.ts`: `view` needs a
non-empty string, rejects a number, rejects an empty string, and `seek` /
`volume_set` still reject a string.

The Home Assistant half — the ten-minute hold and the thirty-second hold after a
swipe — is recorded in the `home-assistant` workspace repo under
`docs/decisions/2026-09-11-a-paused-queue-gives-the-panel-back-after-ten-minutes.md`.
