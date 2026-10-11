# Sliders own their touch contact

Status: Accepted
Date: 2026-10-11
Type: Interaction correction
Supersedes: The unrestricted stage gesture in [the vertical-swipe decision](2026-09-11-a-vertical-swipe-asks-the-house-for-a-view.md), only for slider contacts
Superseded by: —

## Decision

A seek or volume slider owns a contact that begins on it until release or cancellation. Its drag never requests another view, including beyond the 48-pixel navigation threshold or outside its original rectangle. This applies to browser panels and the remote-display touch bridge.

Volume changes after a tap release or a committed horizontal drag. A vertical pull beginning on volume changes neither volume nor view. Top and bottom navigation edges retain their captured contacts across all controls. A cancelled seek clears its preview and sends no seek command.

Horizontal artwork drags change tracks in both directions, including when printer navigation is offered. Vertical artwork swipes retain their existing view navigation behavior. Existing installation policies still decide which view to show.

## Context

The stage accepted slider events as view swipes. The remote-display bridge also converted any 48-pixel control drag into a stage gesture. Native range inputs could send volume on first touch before gesture direction was known. Rightward artwork drags could be mistaken for printer navigation.

## Why

One contact must have one owner. Seeking must not change views, and requesting the time view must not change music volume. Determining ownership from the contact's origin keeps captured gestures stable as the finger crosses other controls.

## Evidence

Owner report in the T3 Code CastKit drag-issues thread, 2026-10-11 (chat id is not exposed in this runtime):

> If I change the seek, it's changing the view. And swiping up from the bottom sometimes triggers the music volume.

The owner identified the affected panel as the printer-workbench Pi touchscreen. Public regression coverage lives in `viewSwipe.test.tsx`, `e2e/mediaControls.spec.ts`, and `device-client/remote-display/test_worker.py`. Browser tests use all four named windows; touch end-to-end coverage dispatches real Chromium touch events.
