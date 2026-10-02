# Public printer views use shared management sign-in

- **Status:** Accepted
- **Date:** 2026-09-30
- **Type:** Access / interaction
- **Supersedes:** —
- **Superseded by:** [Browser views reserve space for content](2026-10-01-browser-views-reserve-space-for-content.md) (access chrome only)

## Decision

Public printer views remain readable without authentication. Enabled printer
controls require a shared management session, checked server-side on each
request and socket update. Signing in once with the management PIN unlocks
controls across views in the same browser for the existing 12-hour session.
Entering the management PIN on a private view also establishes that session;
a view-specific PIN grants viewing access only. View-level controls settings
remain authoritative. Registered native device controls retain their existing
behavior, and render-key and machine authentication remain supported.

Show Read-only with Sign in, or Controls unlocked with Sign out. Pause/Resume
and Stop remain visible when unavailable, use native disabled buttons, and
state the reason. Keep the warning/danger colors and confirmation step.
Signing out revokes the session across views; other tabs refresh on shared
sign-in changes and on becoming visible.

## Context

The management PIN accepted by a private view created only a target grant.
Public views offered no sign-in status, and disabled printer controls vanished.

## Why

Viewing permission and permission to change a running print must be clear and
independent. A single browser session avoids repeated PIN entry while server
checks prevent an anonymous caller from bypassing disabled buttons.

## Evidence

Owner, chat `a0d585d3-5c50-4dee-9843-5b046da597ac`, 2026-09-30:
“Public viewing; PIN unlocks controls across views.”
“Also, it wasn't clear those buttons were disabled.”

- `packages/server/src/platform/platform.test.ts` verifies anonymous rejection,
  shared sign-in, view-PIN viewing only, expiry, and session revocation.
- `e2e/platform.spec.ts` verifies shared tabs, wrong PIN feedback, private view
  navigation and sign-out without issuing a printer command.
- Reviewed states: [read-only](../images/printer-controls-readonly.png),
  [sign-in](../images/printer-controls-signin.png),
  [unlocked](../images/printer-controls-unlocked.png).
