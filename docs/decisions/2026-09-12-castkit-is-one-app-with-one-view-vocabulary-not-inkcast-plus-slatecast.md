# CastKit is one app with one view vocabulary, not Inkcast plus Slatecast

- **Status:** Accepted
- **Date:** 2026-09-12
- **Type:** Architecture / Product
- **Supersedes:** the two-product branding and the split view vocabulary in
  [2026-07-07-castkit-platform-one-server-two-client-modes.md](2026-07-07-castkit-platform-one-server-two-client-modes.md)
  — its one-server, capability-driven core stands; the names **Inkcast** and
  **Slatecast** as separate products do not
- **Superseded by:** —

## Decision

There is one product, **CastKit**. **Inkcast** and **Slatecast** are retired as
product names. They were two ideas that became one app, and the repo must stop
modelling them as two entities.

One consequence binds everything below: **there is ONE view vocabulary.** A view
name means the same thing on every display. The pairs that exist today are the
same view under two names and they merge:

| Today, image mode | Today, browser mode | One name |
| --- | --- | --- |
| `Clock (Weather)` | `Ambient` | the clock-and-weather view |
| `Clock (Agenda)` | `Calendar` | the clock-and-agenda view |
| `Now Playing (Dashboard)` / `(Poster)` | `Now Playing` | the now-playing view |
| `Photo Frame` / `(Fill)` / `(Duo)` | `Photo Frame` | the photo view |
| `Clock` | `Clock` | already shared |
| — | `Queue`, `Weather` | already single-named |

A view **adapts to the panel's properties and feature set**, never to a client
mode. The axes are:

1. black and white against colour, and the colour depth,
2. the dithering pattern, default none,
3. the panel size,
4. the orientation,
5. whether the panel accepts touch,
6. whether the panel renders live or is sent finished images,
7. how expensive a repaint is on that glass,
8. and whatever axis comes next.

⛔ **Do not divide a view, a layout, a test or a Storybook by panel TYPE.** Ask
which property the difference actually keys on. "The ePaper one" and "the touch
one" are not answers — an ePaper panel can have touch, and a touch panel can be
sent finished images. The M5Paper is both at once, which is what proved the old
split wrong.

A layout variant is a property test, and it says which property: the short
landscape layout keys on `(min-aspect-ratio: 5 / 4) and (max-height: 400px)`,
not on "the WT32". A clockless agenda view exists because a repaint is expensive
on that glass, not because the glass is ePaper.

## Context

The repo grew two halves. `@castkit/views` renders React for image panels;
`@castkit/slatecast` renders Preact for live panels. Each half grew its own view
registry, its own names for the same view, its own Storybook, and its own idea of
when an in-progress calendar event stops counting.

The cost came due while wiring a plain request: when a day holds no calendar
events, show the plain time and weather instead of the agenda. The rule is one
sentence, and it could not be written once. Home Assistant had to be handed
`Clock (Agenda)` and `Clock (Weather)` for two displays and `Calendar` and
`Ambient` for two others — four names for two views, and a shared script that has
to be told which pair to use.

The drift is measurable, not theoretical:

- `Ambient` never got the short landscape layout that `Clock`, `Weather` and
  `Calendar` got on 2026-09-11, so the plain view the owner asked for renders its
  date at 16 px on the 480x320 workbench panel — the exact defect that change
  fixed for its three neighbours.
- An in-progress event leaves the agenda at its start time on an image panel and
  an hour later on a live one. Neither number is wrong; nobody chose to have two.
- `Clock (Agenda)` with no events renders identically to `Clock (Weather)`, and
  `Calendar` with no events renders "No upcoming events". Same view, two answers
  to the same empty day.

## Why

- **The owner does not see two products.** He sees one app whose output depends
  on how a screen is configured. The model should match.
- **Panel type was never the real axis.** The 2026-07-07 record already said the
  line is "who renders", with touch a capability on either side. Keeping two
  product names kept the type split alive anyway, in the names, the registries
  and the Storybooks.
- **One vocabulary is what lets a rule be written once.** Home Assistant only
  switches views. It cannot hold a rule about views if the same view has two
  names.
- **Drift is silent.** Nothing failed when `Ambient` missed the short-panel fix.
  A shared view cannot miss a fix its own neighbours got.
- **The properties are the interesting part.** Colour depth, dithering, size,
  orientation, touch and repaint cost are real differences worth handling well.
  "Which package renders it" is not.

## Evidence

> "I wanna unify this code. SlateCast and InkCast were two ideas, but now it's
> just CastKit. I don't perceive these as 2 entities. We really should unify our
> approach with them. I know they're different and have different use cases, but
> like we said before, some ePaper devices have touch, and some touch devices are
> also streaming images. It's really one software now with different views
> _depending_ on your config: 1. Black and White vs Color 1. Dithering pattern
> (default none) 1. Screen Size 1. Orientation 1. etc"

> "We should't divvy this up based on panel type, it should be divvied up based on
> the featureset and the different properties of the screen."

— maintainer, this chat (2026-09-12)
