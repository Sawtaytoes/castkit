# Touch navigation uses undrawn edges

- **Status:** Accepted
- **Date:** 2026-10-06
- **Type:** Interaction
- **Supersedes:** [Either-edge view drawer](2026-09-21-a-touch-panel-opens-its-view-drawer-from-either-screen-edge.md), for painted handle geometry
- **Superseded by:** —

## Decision

Touch displays use undrawn full-height side regions for the configured view drawer. Their existing tap and inward-pull actions remain available. Top and bottom strips stay above external application iframes and invoke the existing audio/time gestures: pull down for Now Playing/Queue, pull up for Calendar when agenda items remain, otherwise Ambient. The view allow-list still applies.

A held view retains the existing side hand-back priority. The shell edges own their captured pointer, including on frame-streamed touch displays. A contact must start inside an acknowledged edge hitbox; its inward pull may then leave that strip. Ordinary controls retain their cross-control cancellation guard. Horizontal artwork drags remain track controls.

## Context

Side handles occupied only the middle portion of the screen. Top/bottom stage handlers were behind external iframes, and the remote-display bridge cancelled edge contacts before converting them into synthetic stage gestures. A finger reaching the correct edge therefore did not reliably reach the intended shell action.

## Why

Navigation must remain reachable above every view, and touch behavior should follow the display's input property. Dedicated edge identities let the bridge preserve native pointer capture without weakening ordinary button fencing.

## Evidence

> “I'd like to do swiping from the top, bottom, and sides.”

Owner, T3 Code chat `fc07df05-c195-437a-b4f0-a2829da14443`, 2026-10-06. Regression coverage exercises all four edges above an iframe in the four browser windows and native Chromium touch routing after leaving each edge's acknowledged rectangle. Artwork transport and contact cancellation remain covered.
