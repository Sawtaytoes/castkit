# A pull shows no release hint

Status: Accepted
Date: 2026-11-02
Type: Interaction
Supersedes: In part, [2026-10-22: Browser navigation acknowledges input and preserves motion](2026-10-22-browser-navigation-acknowledges-input-and-preserves-motion.md)
Superseded by: None

## Decision

A display shows no hint while a finger pulls from an edge. The "Release for …"
label and its progress bar are removed, for every edge and every display.

The rest of the October 22 decision stands. After release, an unanswered request
still shows "Opening …" with a waiting indicator, a request that waits too long
still offers a retry, and the new view still animates into place.

## Context

The October 22 decision added a local pill during a pull: "Release for audio",
"Release for time", or "Release for Points". On the Prestos, swipe destinations
are now drawn ahead and shown at release, so the pill no longer covers a wait.
It appears on the glass while the finger moves and then the destination replaces it.

## Why

The owner does not want the hint. The view that appears at release is enough
acknowledgement.

## Evidence

Owner, T3 Code thread `860ad19b-ab21-4b44-bed4-21a4c4f3eaba`, 2026-11-02:

> The "swipe for X" message still shows. I don't like that. Just remove it.

Earlier, in the instant-swipe conversation (2026-10-26):

> What's release for audio and release for point?
