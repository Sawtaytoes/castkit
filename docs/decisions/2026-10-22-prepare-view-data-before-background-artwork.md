# Prepare view data before background artwork

Status: Accepted
Date: 2026-10-22
Type: Performance and loading
Supersedes: None
Superseded by: None

## Decision

Prepare every assigned composition snapshot before warming its static artwork.
Both passes stay sequential and bounded to eight destinations. A slow image must
not hold the next known view's data or rendered-tree preparation behind it.
Background image requests have a 2.5-second network deadline; active visible
images keep their ordinary loading behavior. Album artwork is optional for frame
readiness: a Music view can show its title and controls while covers load. Required
photos, camera/plugin readiness and the fresh authorization of controls retain
their existing gates. Failed background requests remain
optional and do not retain partial assets or change authorization.

## Context

The first warmer awaited each composition's images before requesting the next
composition. An image proxy waiting on upstream artwork could therefore leave
unrelated assigned views cold even though their snapshots were immediately available.
The device trace contained image requests taking more than ten seconds.

## Why

View structure and data determine whether a switch can happen immediately. Prepare
those first, then spend the background budget on optional images. This extends the
existing bounded-cache policy without extra sockets, documents or persistent media.

## Evidence

Owner: "There's a lot of loading. Do we not pre-cache views or something?"

Owner: "Everything is at CastKit, so we already know what pages to load."

Source: T3 Code chat `8ef10dee-632c-46d3-af23-6b22ddbeb244`, 2026-10-22.
