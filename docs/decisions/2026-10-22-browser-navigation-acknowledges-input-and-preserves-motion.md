# Browser navigation acknowledges input and preserves motion

Status: Accepted
Date: 2026-10-22
Type: Interaction and performance
Supersedes: None
Superseded by: None

## Decision

Live browser displays acknowledge a pull locally while the finger moves, show an
animated waiting indicator after release, and animate the new view into place.
Respect reduced motion and the effective repaint grade. Image delivery retains
its existing repaint budget; a small browser is still an instant display.

Keep the latest complete composition through brief controller handoffs and disable
its controls while the destination changes. Superseded loads remain cancelled.
Repeated unanswered requests for the same destination do not queue duplicates;
a different destination remains available immediately. An unanswered request has
a visible bounded waiting state and permits retry.

Browser view notifications precede asynchronous MQTT state persistence. Their
order must follow requests, not broker acknowledgement timing. Identical HTTP
bootstrap and socket snapshots must not build and measure the composition twice.

## Context

The existing retained-view loading state had no visible input acknowledgement.
View transitions skipped first mounts, including composition remounts during
controller handoffs. Waiting for retained-state publication before broadcasting a
view also allowed delayed older requests to arrive after newer requests.

## Why

A person needs immediate evidence that a gesture registered. Browser motion is
part of navigation and must survive performance improvements. Avoiding redundant
rendering and temporary fallback mounts reduces work on memory-limited browsers
without keeping hidden compositions or adding a framework.

## Evidence

Owner, T3 Code thread rooted at `t3-2fb5b865`:

> There needs to be some sort of animation or indication of what you're doing

> I love animations

> these are "instant" screens like a regular browser

Regression coverage exercises delayed and reversed broker acknowledgements,
pull/cancel/retry feedback, retained controller handoffs, stale responses,
duplicate snapshots, first-mount motion, reduced motion and slow repaint.

Fictional browser fixture captures at 1024×600:

- [Before acknowledgement](../images/navigation-feedback/before.png)
- [During a pull](../images/navigation-feedback/pulling.png)
- [Waiting for the controller](../images/navigation-feedback/loading.png)
