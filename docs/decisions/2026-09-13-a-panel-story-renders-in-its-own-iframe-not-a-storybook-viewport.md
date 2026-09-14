# A panel story renders in its own iframe, not a Storybook viewport

- **Status:** Accepted
- **Date:** 2026-09-13
- **Type:** Storybook / Tooling
- **Supersedes:** — it replaces the viewport-preset mechanism introduced alongside [2026-09-12-castkit-is-one-app-with-one-view-vocabulary-not-inkcast-plus-slatecast.md](2026-09-12-castkit-is-one-app-with-one-view-vocabulary-not-inkcast-plus-slatecast.md), whose story set is unchanged
- **Superseded by:** —

## Decision

**Every slatecast panel story renders inside a nested `<iframe>` sized to that
panel, and the Storybook viewport preset is no longer what makes a story
correct.** Three rules follow:

1. **One story per panel, for every view.** `BROWSER_DEVICE_PROFILES` is the
   list, and `buildDeviceStories` emits a story for all of it. A view file may
   not ship a subset.
2. **The profile list is the device inventory.** A panel the household runs is a
   profile here, including both orientations when the kiosk can run both. The
   Raspberry Pi Touch Display 2 joins as `pi-touch-landscape` (1280×720) and
   `pi-touch-portrait` (720×1280).
3. **A round panel is masked to its circle**, in the single-panel frame and in
   the all-screens matrix. A square preview of a round display hides the exact
   corners the bezel eats, which is the only thing the round layout exists to
   handle.

The toolbar's viewport list is still populated, now from the same profile list,
so any story can be re-checked at another panel's size by hand. It is a
convenience, not the mechanism.

Images in a story come from static sample files, not from a mocked endpoint.
`__setPhotoUrlBuilderForStories` points `PhotoFrame` at one of the repo's
CC0 sample photos, and `artworkPath` in the Now Playing fixture is a static
path. The Mock Service Worker is gone from this Storybook; `msw` stays a
dependency because the test harness uses it for the WebSocket, where no static
equivalent exists.

## Context

`storybook.octen.dev` shows this Storybook as a **composed ref**. A composition
has one manager — the host site's — and the host owns the toolbar. A ref's
`parameters.viewport` never reaches it, so the preset silently did nothing
there, while passing at localhost, where the ref is served at the root and is
its own manager.

The owner reported it as a layout regression: the Now Playing view had "a lot
of padding and less room for text", and both the artist and the album wrapped
to two lines. Nothing had regressed. The story labelled "Workbench (480×320
landscape, touch)" was rendering in a 1200×610 document, where `vmin` is 6.1px
instead of 3.2px and `@media (max-height: 400px)` does not match at all — so
the short-landscape layout, which is the entire reason that story exists, had
never once appeared in the composed site.

Photo Frame shipped two of the five panels, and its picture came from a Mock
Service Worker answering `/d/<id>/photo`. A service worker must register,
activate and claim the page before the first `<img>` fires. When it loses that
race the view falls back to its "No photos configured" placeholder, which is
what the owner saw.

## Why

An iframe carries its own viewport. That makes it correct in a composition, at
localhost, behind a devshare hostname and inside the all-screens matrix, with
no toolbar state to get right and nothing for a host site to drop. The matrix
had already paid this cost for the same reason since it was written; the
single-panel stories were the inconsistent ones.

The alternative was to teach the host composition about each ref's viewports.
There is no supported way to do that, and it would put the correctness of a
CastKit story in a different repository.

A static file cannot lose a race with a service worker, and a story that
intermittently shows an empty state is worse than no story: it trains the
reader to distrust the panel rather than the harness.

## Evidence

Measured on 2026-09-13 against the deployed composed site and against local
builds of `91e651b` and this branch.

| Where | Preview document | `(max-height: 400px)` | `.seek-track.interactive` |
| --- | --- | --- | --- |
| Composed site, before | 1200×610 | no | 90px tall, 36px padding |
| Panel frame, after | 480×320 | yes | 38px tall, 14px padding |

The 38px/14px figures are the ones the WT32 panel itself reports, so the story
and the glass now agree.

Story ids after the change, confirmed from the built `index.json`: 35 view
stories, five panels across seven views, plus the matrix.

The owner, on the composed site:

> Is Storybook up-to-date for CastKit? I'm asking because it seems as though you
> changed how this renders. It now has a lot of padding and less room for text.

> In addition, these sizes don't cover the screens we're targetting […] It could
> have _more_ than those screens, but it _also_ needs to cover them

> And we need to add masking to the Porthole one to mimic the circle.

> We also need to fix the Storybook for these image views and other ones.
> Nothing is showing here. We need a way to display fake image previews for all
> the variants and views.

Chat: T3 Code thread `d17ac437-9af3-4119-821a-b5e96b8e96ea`.
