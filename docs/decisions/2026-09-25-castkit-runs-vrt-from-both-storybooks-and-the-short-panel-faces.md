# CastKit runs VRT from both Storybooks and the short-panel faces

- **Status:** Accepted
- **Date:** 2026-09-25
- **Type:** CI / testing
- **Supersedes:** the "no snapshot or screenshot/VRT tests" clause of the testing conventions in `AGENTS.md`, inherited from the mux-magic family and never recorded here. It is narrowed, not dropped: a unit test still asserts values inline and never on a picture.
- **Superseded by:** —

## Decision

CI runs a `vrt` job: Charcuterie's `shared-vrt.yml@workflows-v1`, compared by reg-suit
against the baseline in this repo's bucket, report at `https://castkit.reg-suit.octen.dev`.
It shoots three sources into one directory:

1. **`web/`** — every story of the ePaper Storybook (`@castkit/web`): each static view on
   each example panel, the dither comparisons, the margin stories and the all-screens grid.
2. **`slatecast/`** — every story of the browser Storybook (`@castkit/slatecast`): each
   view at each real panel profile (`Views/<View>` × the five device stories), the printer
   states, the composed dashboards and the out-of-date state. Its all-screens grid is
   removed after the capture: its cells are `loading="lazy"` iframes, so a shot of it is the
   first row and a column of blank frames, and every cell is already its own story.
3. **`platform/`** — `yarn vrt:capture`, a Vitest browser run of
   `packages/slatecast/src/platform/ShortPanel.vrt.tsx` under its own config: the platform
   Ambient, Clock and Calendar faces and the device-page Ambient view on the real 480x320
   short panel, each drawn as a physical display's page, edge to edge, in the view's dark
   scheme.

Everything is pinned. The clock is Wednesday, July 2, 2025, 1:34 PM in Chicago — the same
instant the ePaper fixtures print. The browser Storybook freezes `Date` only when
`navigator.webdriver` is set, so a person opening it still sees the time tick. The
`platform/` run fakes `Date` and pins the page's locale and time zone in its config; the
Storybook capture reads the time zone of the runner, which sets `TZ=America/Chicago`.
Weather is 72°, partly cloudy; the agenda is three fixture rows.

`*.vrt.tsx` files write pictures and assert only that the face they shoot is present.
`yarn test` never runs them.

## Context

On 2026-09-25 a rebuilt renderer changed the Rip Deck display's clock, date and weather
text — size, font, layout and the purple weather marks — and nothing caught it. The unit
tests pinned the DOM and passed while the picture changed. The owner found it by looking
at the glass. The workspace decision the same day makes VRT a rule for every owned app on
Charcuterie.

The two Storybooks already stage every view at every panel, so they are most of the shot
set for free. They do not stage the platform renderer at 480x320, which is what the Rip
Deck panel loads; `ShortPanelClockFaces.test.tsx` and `AmbientShortPanel.test.tsx` already
rendered exactly those faces, so the capture reuses their setup rather than inventing a
story to get a picture.

## Why

- A view-only product with no picture gate has no gate on the thing it does.
- Separate `*.vrt.tsx` files under their own config keep `yarn test` a pure assertion run
  and make "which files write shots" a file-name question.
- Freezing the Storybook clock only under automation keeps the published Storybook live
  for people while every clock, calendar and weather shot is stable.
- Deleting the lazy grid rather than excluding it by id: `storybookExclude` matches the id
  in both Storybooks, and the ePaper grid of the same id renders in one document and is a
  useful shot.

Measured determinism, five full local captures (116 shots each): 107 shots byte-identical
every run. The nine that are not — the eight porthole view stories and Now Playing on the
workbench panel — differ only on antialiased pixels at the edge of the round bezel mask (at
most 304 pixels of 1,024,000) and pass reg-suit's own comparison (`thresholdRate` 0.02,
antialiasing tolerated) against each other. One run in about nine timed out waiting for
network idle on one `States/Out Of Date` story; it did not reproduce in four targeted runs.

## Evidence

Owner, 2026-09-25, T3 Code chat on branch `t3code/fix-castkit-time-weather-text` in the
agentic workspace: *"Oh man, we should add it. I thought it was there this whole time
because _all_ Charcuterie apps should have them; especially, this one that is 100%
view-dependent."* and *"We have Storybook, so that's on avenue for VRT shots, and some
tests can also do them if it makes sense."* Workspace record:
`agentic/docs/decisions/2026-09-25-every-owned-charcuterie-app-runs-vrt.md`.
