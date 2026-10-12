# CastKit desktop app

`@castkit/desktop` is an Electron app that shows CastKit pages in their own
windows on a desktop PC. Each window shows one page from your CastKit server
and remembers, across restarts:

- which monitor it is on and where;
- whether it is fullscreen;
- its zoom, separately for every view it shows.

Each window is a **virtual device** with a stable id. It is the desktop
equivalent of a kiosk panel. See the
[decision record](../../docs/decisions/2026-10-12-the-desktop-app-is-an-electron-shell-whose-windows-are-virtual-devices.md).

## Install

Windows builds are published as GitHub releases tagged `desktop-v<version>`.
Download `CastKit-<version> Setup.exe` and run it. The installer needs no
administrator rights; it installs for the current user and adds a Start menu
shortcut. A `.zip` of the same build runs without installing.

The app runs from the notification area (system tray). Closing every window
does not quit it; use **Quit CastKit** in the tray menu.

## Connect to your server

On the first launch the settings window opens.

1. Enter the address of your CastKit server, for example
   `http://castkit.local:8788`, and select **Save**.
2. Under **Add window**, enter a page (`/screen/<id>`, `/view/<id>`, or
   `/d/<id>`) or select one of the screens and views your server lists.
3. Select the display and whether the window starts fullscreen, then select
   **Add window**.

Open the settings window again from the tray menu (**Server and settings…**)
or from a window's menu. Changing the server address keeps every window on the
same page of the new server.

Only the configured server loads inside the app. A link to any other address
opens in your normal browser.

## Windows and displays

Every window has three menus with the same actions:

- the tray menu, which lists every window;
- the window's menu bar, which appears when you press Alt;
- a right click with the mouse inside the window.

| Action | Shortcut |
| --- | --- |
| Fullscreen | F11 |
| Reload | Ctrl+R or F5 |
| Zoom in | Ctrl+= or Ctrl + mouse wheel up |
| Zoom out | Ctrl+- or Ctrl + mouse wheel down |
| Actual size | Ctrl+0 |
| Move to display | menu only |
| Remove window | menu only, or close the window |

**Identify displays** shows a large number on every monitor for three seconds.
The numbers are the ones **Move to display** uses, counted left to right.

At launch each window goes back to its monitor. The app finds the monitor by
its id first. Windows can change display ids after a driver update or when a
monitor is plugged in again, so the app then looks for the same monitor name
and position, then the same name and size. If the monitor is not connected,
the window opens on the primary display, and it goes back by itself when the
monitor is connected again.

Closing a window removes it, with its zoom levels and its sign-in. Quitting the
app keeps every window for the next launch.

## Zoom per view

Chromium keeps one zoom level per site, so in a browser every CastKit page
shares one zoom. In this app each window has its own browser session, and the
app saves a zoom level for every view a window shows. A screen that switches
from its agenda view to its music view switches zoom with it. A consequence of
the separate sessions: each window asks for the management PIN on its own.

## Launch at login

Turn on **Launch at login** in the tray menu. The installed app starts through
the installer's `Update.exe`, so the setting survives updates.

## Where settings are stored

Everything is in one file, `desktop-state.json`, in the app's user data
folder (`%APPDATA%\CastKit` on Windows). The file is written atomically. If it
cannot be read, the app moves it to `desktop-state.json.corrupt` and starts
with no windows. Set `CASTKIT_DESKTOP_STATE_FILE` to use another file, for
example to test.

## Develop

```sh
pnpm install
pnpm --filter @castkit/desktop exec install-electron   # Electron's binary; not part of pnpm install
pnpm --filter @castkit/desktop start                    # build and run
pnpm --filter @castkit/desktop test                     # unit tests
pnpm --filter @castkit/desktop make                     # installers into packages/desktop/out/make
```

`scripts/build.mjs` bundles the main process, both preloads, and the settings
page into `dist/` with esbuild, and renders the app icons from CastKit's mark.
The packaged app contains only `package.json` and `dist/`.

The release workflow (`.github/workflows/desktop-release.yml`) builds the
Windows installer. A push of a `desktop-v<version>` tag publishes a release; a
manual run with a version does the same; a pull request that changes this
package only builds and uploads the installer as a workflow artifact.

## Security

Every page window runs with `contextIsolation`, `sandbox`, and no Node
integration. Its preload exposes nothing to the page; it only reports which
view is on screen. Pages cannot open new windows or attach `<webview>`, and
the only permission granted is fullscreen for the configured server. The
packaged app has Electron's fuses set so it cannot run as plain Node and loads
only from its integrity-checked archive.
