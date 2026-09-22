# A touch panel opens its view drawer from either screen edge

- **Status:** Accepted
- **Date:** 2026-09-21
- **Type:** Interaction / view navigation
- **Supersedes:** [A vertical swipe asks the house for a view](2026-09-11-a-vertical-swipe-asks-the-house-for-a-view.md), for the claim that an external view has no on-screen exit and for direct view navigation
- **Superseded by:** [A view drawer and its views are configured per display](2026-09-21-a-view-drawer-and-its-views-are-configured-per-display.md)

## Decision

Every touch-capable browser panel carries a narrow view handle on both vertical screen edges. A tap or a 48 px inward pull opens the same view drawer from that side. The drawer lists every view CastKit offers that device as a large direct target. It remains above native views and external application iframes, so an external view can never remove the on-screen way back.

A choice from this drawer sends the existing `view` command through the authenticated device WebSocket. The CastKit server validates the requested client id against that device's offered views, applies it immediately, retains the matching View state, and still publishes the command for Home Assistant. Home Assistant can apply later policy, but it is not a required round trip for a person standing at the screen.

Touch devices also receive a native **Touch Test** view. It shows five physical targets and paints the exact coordinate Chromium reports for the last tap. The reported blue dot must appear under the finger. This verifies the complete controller, compositor calibration and browser path on the installed glass; a compositor screenshot cannot.

The existing vertical swipe remains for Now Playing and Calendar. The edge drawer is separate: it is visible, it reaches all offered views, and its overlay owns pointer input even while an iframe fills the panel.

## Context

The BambuBuddy Touch Display 2 joined CastKit with SpoolBuddy as an external view. Its View entity worked in Home Assistant, but the installed panel had no way to enter SpoolBuddy by itself. The existing vertical swipe published a request that this new display had no Home Assistant automation to accept, and an external iframe could not bubble a gesture back to the CastKit stage.

The touch coordinates had also been rotated at the compositor, but software inspection could prove only the configured matrix. It could not prove that a physical tap landed under the owner's finger.

## Why

The control must survive every view it controls. An edge layer owned by the CastKit shell does; a handler behind an iframe does not. Two edges keep the handle reachable regardless of which hand approaches the panel, while the drawer avoids assigning a permanent view meaning to left and right when a device can offer more than two views.

Immediate server-side application keeps the interaction useful without a device-specific Home Assistant automation. Validation preserves CastKit's capability boundary, and the retained state keeps Home Assistant's View selector synchronized.

The touch test measures the user's actual concern. A matrix value can be mathematically plausible and still use the wrong physical rotation. A visible dot under a physical finger is direct evidence.

## Evidence

> “Pull down from the top doesn't work.”

> “maybe we can do pull from the sides as well for different views.”

> “I need a way to do it from the screen”

> “I also need to make sure touch points are accurate.”

Owner, T3 Code chat `t3code-31fc6ae0`, 2026-09-21.
