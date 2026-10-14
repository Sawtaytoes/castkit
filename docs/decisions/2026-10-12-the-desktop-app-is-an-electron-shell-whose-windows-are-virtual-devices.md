# The desktop app is an Electron shell whose windows are virtual devices

Status: Accepted
Date: 2026-10-12
Type: Platform
Supersedes: None
Superseded by: [2026-10-13-a-closed-desktop-window-is-kept-and-every-window-shares-one-sign-in.md](2026-10-13-a-closed-desktop-window-is-kept-and-every-window-shares-one-sign-in.md) (in part: the PIN cookie per window, and a close that removes the window)

## Decision

CastKit has a desktop app, `@castkit/desktop` (product name CastKit), and it lives in this monorepo as one more workspace package beside the server and the views. It is an Electron shell. It renders nothing of its own: each window loads one CastKit page — `/screen/<id>`, `/view/<id>`, or `/d/<id>` — from one configured CastKit server.

1. **A window is a virtual device.** Each window has a stable id (`window-<8 hex>`) that survives restarts and names everything that belongs to that window.
2. **Each window has its own session partition**, `persist:castkit-window-<id>`. Chromium keeps zoom per origin inside a session, so `setZoomFactor` on one window would otherwise change every window showing the same server. A partition per window makes zoom, the management PIN cookie, and storage per window.
3. **Zoom is saved per window and per view.** The page names the view on screen in `data-view` (on `main.platform` for `/screen` and `/view` pages, on `.stage` for `/d` pages); a preload watches it and the main process applies that view's saved factor. Ctrl +, Ctrl -, Ctrl 0, and Ctrl + mouse wheel change and save it. A page that names no view falls back to its path.
4. **Placement is restored by display id, then by label and bounds.** Each window saves its display's id, label, and bounds with its own bounds and fullscreen state. At launch the display is found by id; failing that by label and exact bounds, by label and size, then by exact bounds; the last two only when one monitor matches. A monitor that is gone puts the window on the primary display, logs it, and leaves the saved placement unchanged, so the window goes back when the monitor returns.
5. **The page is untrusted content in a hardened window**: `contextIsolation`, `sandbox`, no Node integration, no `webview`, navigation only to the configured origin, and every other link opens in the system browser.

## Context

The maintainer runs CastKit pages on a desktop PC with several monitors, one of them a small 1024 x 600 monitor without touch. Each page was a Chrome tab in fullscreen: fullscreen had to be entered again after every restart, nothing put a tab back on its monitor, and Chrome's zoom is one value per domain, so every CastKit page shared a single zoom.

Image-Viewer, another Electron app by the same maintainer, already spawns windows onto chosen displays, identifies monitors with an overlay, and corrects window bounds on mixed-DPI monitors with a second `setBounds`. The desktop app reuses those patterns. Image-Viewer does not restore placement after a restart; this app does.

## Why

- A desktop shell is the only way to hold placement, fullscreen state, and zoom per window across restarts; a browser keeps none of the three per tab.
- In the monorepo, the desktop app moves with the routes and attributes it depends on. A change to how a page reports its view is visible in the same pull request. The maintainer asked for it to live here "as a plugin like the rest."
- Windows can renumber display ids after a driver update or a re-plug. An id alone would put windows on the wrong monitor, and a label alone cannot tell two monitors of one model apart.
- Treating each window as a virtual device keeps one vocabulary: a window is configured, placed, and zoomed like any other display, and a later phase can give it a device identity (for example, a Sendspin audio player) without a new concept. Autoplay without a user gesture is already enabled for that phase.

## Evidence

Maintainer, T3 Code thread `c7860ee1-8571-4d27-9427-61518279e6d6`, 2026-10-11 and 2026-10-12:

> I'd like to make a CastKit Electron app. That way, I don't have to keep doing a fullscreen mode on Chrome … And I can have separate zoom levels per view rather than one for the whole domain.

On where it lives:

> CastKit repo as a plugin like the rest.

- Package: `packages/desktop` (`src/displayMatching.ts`, `src/zoomByView.ts`, `src/desktopState.ts`, each with a colocated test).
- Page attribute: `packages/slatecast/src/platform/PlatformApp.tsx` (`data-view` on `main.platform`), covered by `Platform.test.tsx`.
- Image-Viewer patterns reused: `describeDisplays`, `showIdentifyOverlay`, and the second `setBounds` in its `src/main.js`.
