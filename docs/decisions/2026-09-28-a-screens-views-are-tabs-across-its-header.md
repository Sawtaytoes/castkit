# A screen's views are tabs across its header

- **Status:** Accepted
- **Date:** 2026-09-28
- **Type:** navigation / UI
- **Supersedes:** —
- **Superseded by:** —

## Decision

1. **A browser screen shows its views as a row of tabs across its header**, every
   one visible, the way Home Assistant's dashboard views are. Each tab is a real
   link to `/view/<id>` that the platform turns into the screen's select call. The
   row scrolls sideways when a screen carries more views than fit, and the active
   tab is scrolled into view. The native `<select>` view picker is gone.
2. **Management's destinations are the Charcuterie `Nav` in a side `Rail`**, with
   `useNavLayout` choosing rail, icon rail or header menu by width, exactly as
   Docket wires it. Nothing about the destinations changed; only where they are
   drawn.
3. **The CastKit mark in the header is the way home.** The `Home` link in the
   management header and on the public library page is removed; the heading is a
   link to `/`, with the favicon beside it, as every other owned app does.

## Context

The owner opened a screen with one view and found a native `<select>` labelled
"View" in the header. A screen already holds many views (its `viewIds`), but the
picker hid them behind a control the fleet deprecated on 2026-08-20 and lints
against in every owned app; slatecast is Preact and does not take
`@charcuterie/ui`, which is how one survived here. Management drew its `Nav`
as a header bar at every width, with the side rail the library provides for it
left empty, and carried a separate `Home` link beside a heading that did nothing.

## Why

- Tabs show the screen's whole vocabulary at once and cost one tap. A select
  shows one name and costs two, and paints as the OS widget the owner refuses.
- Real links keep middle-click, ctrl-click and "open in a new tab"; the click
  delegate that already handled `/view/<id>` anchors elsewhere on the page now
  handles the tabs for free.
- The rail is what `Shell` reserves the track for, and `useNavLayout` owns the
  width rule; an app owns only where the two states are placed.
- A heading that is a link needs no second link that says the same thing.

## Evidence

Owner, 2026-09-28 (chat `a86efc56-0324-449a-bdf7-b936102abb20`): "the dropdown
is a native select, something I've said repeatedly to never use anymore. It's
even deprecated in the code! Like Home Assistant, can I just have them be tabs
at the top for a single screen? That'd be what I want." And: "The Home button on
the top-right should be removed. The CastKit logo should do that. We're also not
using the sidenav we specifically created for this multi-nav purpose."
