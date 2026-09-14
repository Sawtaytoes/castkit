# The artwork is the transport on every touch panel, and the text is centered on it

- **Status:** Accepted
- **Date:** 2026-09-11
- **Type:** Layout / Interaction
- **Supersedes:** [2026-09-10-the-artwork-is-a-control-not-a-picture.md](2026-09-10-the-artwork-is-a-control-not-a-picture.md) (only the part where the transport row still sits under the art) and the "transport row goes" clause of [2026-09-10-a-short-landscape-panel-lays-now-playing-out-beside-the-art.md](2026-09-10-a-short-landscape-panel-lays-now-playing-out-beside-the-art.md), which now holds for every panel
- **Superseded by:** —

## Decision

1. **There is no transport row on any touch panel.** The artwork is play/pause
   (tap) and next/previous (drag), as the 2026-09-10 record already made it;
   the three buttons under it are removed from the component, not hidden. The
   art grows into the row they took: `52vmin` on the square (374px at 720),
   the same size the touchless picture already had.
2. **On the short landscape panel the text block is centered on the art.** The
   title, artist, album and seek bar form one block whose middle sits at the
   art's middle. The grid is `1fr auto auto 1fr` down the text column; the two
   equal `1fr` rows do the centering whatever height the block takes.
3. **Each text line may wrap, and the row counts are measured, not fixed.**
   On the short panel the title may take up to four rows, the artist three and
   the album two. `fitTrackLines` (`views/trackLineFit.ts`) writes those
   counts as `--title-lines` / `--artist-lines` / `--album-lines` on the block,
   measures it against the column's remaining height, and steps down a budget
   table until it fits — so a long title gets the rows a short artist leaves
   over, and a track where every line is long trims the artist and album before
   the title. The square keeps the stylesheet's fixed counts (two-row title,
   one-row lines).
4. **The sliders are drawn for a finger.** The seek track is `2vmin` tall with
   a `4.5vmin` knob at the end of the fill; the volume range is drawn by hand
   (`appearance: none`) with a `2vmin` track and a `5.5vmin` thumb, and carries
   `touch-action: none`. On the short panel the same in px: 10px tracks, a 22px
   seek knob, a 26px volume thumb.

## Context

The short-panel layout landed on 2026-09-10 with the text block in a single
`1fr` row, `align-self: end`, and the artist and album on one `nowrap` row each.
On the panel the block read as pinned to the bottom-right of the art, and a long
album name ended in an ellipsis beside 60px of empty column. The 720×720 square
still carried the three transport buttons under a 42vmin picture, although its
art had been a control since the same day.

The volume slider on the square could be tapped to a level but not dragged. The
native range input's thumb is 16px whatever the panel, and a horizontal drag on
a `touch-action: auto` element is a pan gesture to the panel's browser — the
artwork frame already carries `touch-action: none` for exactly that reason.
Driven with real CDP touch events in headless Chromium the drag moves the value
from 24 to 75 across eight moves with the new styling; the pre-change behavior
on the Pi itself was not reproduced in the sandbox, so the `touch-action` fix is
the likely cause rather than the proven one, and the thumb size is the certain
improvement.

## Why

- **Centered over pinned.** A block whose height varies has to be anchored
  somewhere; anchoring it to the art's middle keeps the visual weight on the
  picture, which is what the layout is built around. Equal `1fr` rows above and
  below cost no JavaScript.
- **Measured over fixed row counts.** The column is 224px wide and 256px tall.
  Fixed counts either waste rows (a two-row title under "Beck") or overflow (a
  four-row title over a three-row artist). The only honest answer is the
  rendered height, which also survives a font swap — the block is observed and
  re-fitted when Outfit replaces the fallback face.
- **One control, not two.** Two ways to skip a track (buttons and a swipe) is
  one more thing to explain on a panel nobody reads instructions for. The
  owner asked for the picture to be the control everywhere and the buttons to
  go.
- **A slider needs a thumb a finger can find.** `accent-color` cannot size the
  native thumb; drawing the track by hand can.

## Evidence

Owner, 2026-09-11 (chat `0adde1d5-e233-4c59-bf0f-4fed81fba6d7`):

> One thing though, the text was centered in your example, but now it's
> bottom-aligned. That looks really odd. And it cuts off the album name and
> artist, but there's plenty of room. Give a few lines each. We can make this
> dynamic too. If the title is really long but the artist is like "Beck", then
> as long as it fits, we're good. Making dynamic code like that is tough, but
> possible.

> Either way, the title, artist, album, and timecode should be centered on the
> image, not all the way at the bottom like it was implemented.

> Now that we have this new view, I'd like to use the thumbnail image as the
> controls there too. Can we make it so it hides the pause/play next/prev and
> uses only the thumbnail for that? Should give us a ton more space and make
> the album art a lot larger.

> I'd like to make the volume and seek bars a tad larger too so they're easier
> to touch. Is there drag 'n drop on the volume one? I found that clicking
> works, but dragging did not.

Tests: `NowPlayingShortPanel.test.tsx` (centering within 4px, two-row artist and
album, a four-row title beside "Beck", the trim when every line is long, the
square's 52vmin art with no transport buttons). The volume drag was driven with
`Input.dispatchTouchEvent` against the built bundle; the values are in the PR.
