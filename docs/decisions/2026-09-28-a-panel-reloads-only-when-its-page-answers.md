# A panel reloads only when its page answers

- **Status:** Accepted
- **Date:** 2026-09-28
- **Type:** Deployment / client lifecycle
- **Supersedes:** —
- **Superseded by:** —

## Decision

Every reload a browser panel performs on itself goes through `reloadPage()`, and
`reloadPage()` first fetches the page's own URL. It reloads only when that answers
2xx, and it retries every 2 s with **no deadline** until it does.

This covers all four callers: a snapshot with a different bundle id
([the build reload](2026-09-23-a-new-build-reloads-a-live-browser-panel.md)), Home
Assistant's `reload` message, and a platform display's 409 on load and on select.
`platform/useDisplay.ts` called `window.location.reload()` directly and now uses the
same seam. One poll loop answers every caller that asks during the same outage.

It checks the page's URL rather than `/health` because that is exactly the
document the reload will fetch.

## Context

On 2026-09-28 a CastKit redeploy left a workbench panel on the reverse proxy's
`502 Bad Gateway` page. The new container sent a snapshot with the new bundle id,
the panel reloaded at once, and the reload reached the proxy while the upstream
was still unavailable. The proxy's page carries no CastKit code, so nothing on
the glass ever tried again.

The build reload is, by construction, a reload that happens during a deploy —
the one window in which the proxy is most likely to answer 502.

## Why

- A page that is running keeps working while it waits; a page that reloaded onto
  an error page is dead until somebody reaches the panel.
- No deadline, because a deadline only chooses when to give up onto the error
  page.
- The kiosk host keeps its own watchdog for an error page reached some other way
  (a Chromium crash, a manual navigation). This is the half CastKit can prevent.

## Evidence

- Owner, 2026-09-28: *"On Bambuddy Pi's display, does CastKit not reload
  automatically when there's a 502 like there is right now? I swear we fixed that"*
  and, asked whether to fix both CastKit and the kiosk, *"yes"*.
- The panel's CastKit tab read `502 Bad Gateway / openresty` as its whole
  document 11 minutes after the container restarted, while `/health` answered 200.
