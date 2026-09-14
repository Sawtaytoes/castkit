# Storybook names a view and a property, never a panel technology

- **Status:** Accepted
- **Date:** 2026-09-13
- **Type:** Storybook / Tooling
- **Supersedes:** — it extends [2026-09-13-a-panel-story-renders-in-its-own-iframe-not-a-storybook-viewport.md](2026-09-13-a-panel-story-renders-in-its-own-iframe-not-a-storybook-viewport.md), whose per-panel story set is unchanged, and it overrides one line of the [unification plan](../2026-09-12-unify-one-view-vocabulary-plan.md), which had put the Storybook taxonomy out of scope
- **Superseded by:** —

## Decision

**No Storybook title, section, story name or composed-ref title names a panel
technology.** Three rules:

1. **Both Storybooks use one taxonomy: `Views/<View>` and `Overview/All
   screens`.** `Browser views/Ambient` is now `Views/Ambient`. A reader
   navigating either build sees the same shape, because there is one view
   vocabulary and these are two renderers of it.
2. **A story's variants are the registered profiles**, named for what a person
   sees — `Workbench (480x320 landscape, touch)`, `Porthole (round)`,
   `Impression E6 (800x480)`. The property that makes the variant interesting
   belongs in the name; the technology does not.
3. **The two composed refs are named for who renders, which is the `delivery`
   property.** `CastKit — ePaper views` becomes `CastKit — server-rendered
   frames`, and `CastKit — browser views` becomes `CastKit — panel-rendered
   views`. The split is real and it is not ePaper against LCD: the M5Paper is
   ePaper and the WT32-SC01 is a colour LCD, and both are in the first ref,
   because neither runs a browser.

**Coverage is the product of view and profile, and a missing cell is a gap, not
a choice.** Every view ships a story for every registered profile of its
renderer. A property combination the household owns and no story exercises is a
panel nobody can review before it goes on a wall.

**A story is the unit of visual regression.** VRT snapshots per (view,
profile), so a change that only affects round panels, or only mono, fails only
those cells and names them. The harness is not chosen here — see the plan.

## Context

The sidebar read `CastKit — ePaper views` and `CastKit — browser views`, and
each ref's stories then repeated the split: `Views/…` in one, `Browser views/…`
in the other. `AGENTS.md` has forbidden exactly this since 2026-09-12 —
"do not divide a view, a layout, a test or a Storybook by 'the ePaper one'
against 'the touch one'" — and the Storybook was the last place still doing it,
in the most visible way we have.

The owner, seeing it:

> If we haven't done it already, we should stop separating Storybook and these
> views by ePaper and LCD and instead think of these as options or features
> you're enabling or disabling on a per-display basis to change how it functions
> with regards to CastKit.

> If we define these as features, we can start coming up with all the right
> Storybook views and make sure we're properly testing and doing VRTs on each
> variant.

The taxonomy was also carrying a stale fact. Four story names read `M5Paper
mono (540×960)` while rendering the device at its registered 960x540 — the
datasheet pair the panel was re-registered away from on 2026-09-11 after it
composed every text view sideways for six weeks
([decision](2026-09-11-a-panels-registry-size-is-its-layout-box-and-rotation-never-re-lays-out.md)).
A label is not decoration when it is the only thing a reviewer compares the
render against.

## Why

A name is the cheapest place a wrong model reproduces itself. An agent opening
a Storybook titled "ePaper views" concludes there is an ePaper half of this
product, and then writes an ePaper-shaped branch. Renaming costs one commit and
removes the last surface teaching the split.

The two builds genuinely stay two. Slatecast is Preact under a 60 KB gzip
budget and lays out in `vw`/`vh`/`vmin`; `packages/web` is React rendering
Satori-safe inline styles. `preact/compat` is ruled out, so there is no single
framework that can host both. That is a renderer constraint, and naming the
refs after the renderer says so honestly — where naming them after ePaper and
LCD said something false.

Making coverage a product rather than a list is what turns the property model
into a test plan. Nine properties with a handful of values each is a large
space, but the fleet only occupies a few points in it; enumerating profiles
enumerates exactly those points, and adding a panel adds its cells everywhere
at once.

## Evidence

Story titles before and after, from the built `index.json`: seven slatecast
views moved from `Browser views/<name>` to `Views/<name>`, and the matrix from
`Overview/All browser screens` to `Overview/All screens`, matching the
`packages/web` titles that were already `Views/<name>` and `Overview/All
screens`.

The stale labels: `M5Paper mono (540×960)` appeared in eight story files while
`M5PAPER_DEVICE` has read `width: 960, height: 540` since 2026-09-11.

Deep links change. `…/story/castkit-slatecast_browser-views-ambient--porthole`
becomes `…/story/castkit-slatecast_views-ambient--porthole`. The ref ids are
untouched, so a link to a ref still resolves; a bookmark to a specific slatecast
story does not.

Chat: T3 Code thread `a7e03562-acab-4308-ba0d-fc93531ece7f`.
