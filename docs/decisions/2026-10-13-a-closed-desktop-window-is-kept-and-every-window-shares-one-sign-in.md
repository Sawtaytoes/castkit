# A closed desktop window is kept, and every window shares one sign-in

Status: Accepted
Date: 2026-10-13
Type: Platform
Supersedes: [2026-10-12-the-desktop-app-is-an-electron-shell-whose-windows-are-virtual-devices.md](2026-10-12-the-desktop-app-is-an-electron-shell-whose-windows-are-virtual-devices.md) (in part: the PIN cookie per window, and a close that removes the window)
Superseded by: None

## Decision

1. **The X button closes a window and keeps it.** The window's page, monitor, zoom per view, and session stay saved with `isClosed: true`. The tray lists it as "(closed)" with **Open window**, the settings window lists it under **Your windows** with **Open**, and starting CastKit again opens every closed window. Only **Remove window** forgets a window and clears its partition.
2. **Every window shares one sign-in.** Each window keeps its own session partition, which is what keeps zoom per window. The server's `castkit-session` cookie is copied between the partitions (`sharedSignIn.ts`): a PIN typed in one window unlocks every window, a new or reopened window starts signed in, and a sign-out or an expiry is removed from every window. The server keeps every unlock on one session (`platformAccess.ts` adds a grant to the session the cookie names), so the copy carries all of them.
3. **Alt opens the window menu in fullscreen.** Alt pressed and released alone in a fullscreen window opens the same menu as a right click, at the window's corner: fullscreen, reload, zoom, move to display, remove, add a window, and the settings. A window that is not fullscreen keeps its Alt menu bar.

## Context

The 2026-10-12 record made each partition hold "zoom, the management PIN cookie, and storage per window", and closing a window removed it. In use, every window asked for the PIN again, a window closed by mistake could only come back through **Add window**, and a fullscreen window offered no menu on Alt, so moving it to another monitor needed F11 and a drag.

## Why

- Zoom has to be per window, because Chromium keeps zoom per origin inside a session. The sign-in has no such reason: it identifies the person at the computer, not the window.
- A close that destroys configuration is a trap; the window's monitor, zoom, and sign-in took effort to set up. Remove stays available for the deliberate case.
- Fullscreen hides the menu bar on Windows, so the only menu left must be reachable from the keyboard the person is already using.

## Evidence

Maintainer, T3 Code thread `bfbdc019-bd43-45f4-9e7e-df2c7214a3e5`, 2026-10-13:

> I have to type in my PIN on every display. Does it not store that for the whole Electron app rather than the one session?

> The biggest question I have is how to re-open a previous CastKit view once closed. There's no App for it right? I have to open the settings again.

> Pressing ALT gives me no real menu like fullscreen mode on ImageViewer. I can't move that display to another monitor.

- Code: `packages/desktop/src/sharedSignIn.ts` (with `sharedSignIn.test.ts`), `windowManager.ts` (`open`, the `closed` handler, the Alt handling), `appMenus.ts` (`buildWindowPopupMenu`), `desktopState.ts` (`isClosed`, `title`).
- `packages/desktop/scripts/smoke.mjs` checks that a sign-in reaches the other window, that closing keeps the window, and that Alt in fullscreen opens the menu.
