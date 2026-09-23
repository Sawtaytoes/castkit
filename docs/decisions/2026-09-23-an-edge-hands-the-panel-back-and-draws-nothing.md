# An edge hands the panel back, and draws nothing

- **Status:** Accepted
- **Date:** 2026-09-23
- **Type:** Interaction
- **Supersedes:** [A view drawer and its views are configured per display](2026-09-21-a-view-drawer-and-its-views-are-configured-per-display.md), for the workbench panel's navigation only. The per-display `hasViewDrawer` switch and the ordered `views` allow-list both stand.
- **Superseded by:** —

## Decision

The workbench panel turns its view drawer off. An edge on that panel does one
thing: it hands the panel back to the automation.

The edge draws nothing. No handle, no gradient, no label. It is a touch region
and nothing more.

The region exists only while something has taken the panel over — a view the
person asked for, or a SpoolBuddy hold. An edge that has nothing to undo does
not exist, so it cannot swallow a touch meant for the view underneath.

An inward pull of 48 px from either edge commits, and a tap commits as well. The
pull is the deliberate gesture and the same commit distance the drawer already
used. The panel answers with one short confirmation on the glass, which then
goes. A touch that produces no visible answer leaves a person unsure the panel
heard them.

Handing back ends a manual choice **and** ends a SpoolBuddy hold, so the
automation decides again at once instead of waiting out the hold. A manual view
otherwise expires on its own after 30 seconds, which is unchanged.

## Context

The owner asked for the side menus to go. The first replacement proposal walked
the ordered view list from the edges, with each edge labeled by its destination.
The owner rejected the labels as well: the gesture can be implied.

Separately, the owner asked for a way to leave SpoolBuddy when the weighing is
finished, rather than waiting for its two-minute hold to lapse.

## Why

- **The panel is an appliance.** Permanent navigation chrome above every view is
  application furniture on glass that exists to show one thing at a time.
- **Leaving is the only gesture worth a region.** The automation already picks
  the right view from a priority order the owner set. The one thing it cannot
  know is that a person is finished with the view it was told to hold.
- **A swipe cannot be brushed by accident.** An invisible tap target can. The
  48 px of travel is what makes an undrawn region safe.

## Evidence

Owner, T3 Code chat `t3code-737280df`, 2026-09-23:

> We also need to remove the left and right side menus. Those should just switch
> the screen to another view when doing it.

> SpoolBuddy some way to exit out back to the 3D printing status screen.

On the candidate behaviors, after driving an interactive demonstration of all
three:

> Done only, but it can be implied. Doesn't have to be on the screen

> Does swiping from the side not work?
