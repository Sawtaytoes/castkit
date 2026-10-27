# Subscription details open in place with all reported limits

- **Status:** Accepted
- **Date:** 2026-10-27
- **Type:** View behavior
- **Supersedes:** —
- **Superseded by:** —

## Decision

Opening an AI Usage subscription replaces the summary in place, using the same
composition navigation and focus behavior as Points. A Back control returns to
the overview. The subscription logo is vertically centered with its name.

The overview continues to use saved provider/window selection, positive-usage
filtering, and quota alert replacement. Details retain all reported windows for
the selected subscription, including quiet model limits, credits and available
usage-limit resets. Provider selection still limits which accounts can open.

## Context

The initial dialog was small and only received the already-filtered summary.
A saved combined view could therefore show only a weekly quota after opening
details, even though the shared source contained more information.

## Why

A detailed subscription is a navigation destination like a child's Points
history. It needs the available panel space and full subscription information;
summary presentation rules must not discard the detail data.

## Evidence

Owner, 2026-10-27, chat `c04614a5-586c-460f-bbdf-b3bb9d45c4ce`:

> It's also an extremely small modal. I thought it was gonna render in-place like the points views.

The owner clarified that the name beside the logo is the subscription name.
