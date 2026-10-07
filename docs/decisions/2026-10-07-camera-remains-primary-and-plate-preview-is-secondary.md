# Camera remains primary; the plate preview is secondary

- **Status:** Accepted
- **Date:** 2026-10-07
- **Type:** Layout / review
- **Supersedes:** [Browser printer cards preserve small-count layouts](2026-09-28-browser-printer-cards-preserve-small-count-layouts.md), for simultaneous camera and plate preview placement.
- **Superseded by:** —

## Decision

Keep the current camera-first layout. The camera remains above the printer details in the reviewed dashboard shape and receives the available media area. A plate preview is a secondary image of the actual print, never a replacement for the camera. Review its placement using real media in a private preview before implementation. Pull request #104 is closed; resolving its branch conflicts does not approve merging or deployment.

## Context

The older visual report showed a missing camera and an unrelated landscape fixture. It did not demonstrate the plate preview's actual content. Current master includes newer media sizing, enlargement and printer controls that must survive conflict resolution.

## Why

The live camera is the primary way to inspect the print. A small plate preview adds information about what is printing without displacing that view.

## Evidence

Owner, T3 Code chat `t3code-58cf7887`, 2026-10-07:

> The way it's working now is correct. Camera is priority. It should be the focus on the page, not a huge blank space.

> Yes, I wanted that too. I'd forgotten about it. Can I see a real example of what that'd look like, not fake images?
