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

Builds for Windows, Linux, and macOS are published as one GitHub release per
version, tagged `desktop-v<version>`.

- **Windows:** download `CastKit-<version>.Setup.exe` and run it. The
  installer needs no administrator rights; it installs for the current user
  and adds a Start menu shortcut. The `win32` `.zip` runs without installing.
- **Linux (Debian, Ubuntu):** install the `.deb` for your machine,
  `castkit_<version>_amd64.deb` or `castkit_<version>_arm64.deb`, for example
  with `sudo apt install ./castkit_<version>_amd64.deb`. It adds CastKit to the
  applications menu and a `castkit` command. The `linux` `.zip` runs without
  installing, but on Ubuntu 24.04 and later an unzipped build cannot start its
  sandbox, so use the `.deb` there.
- **macOS:** download the `darwin-arm64` `.zip` for Apple silicon or the
  `darwin-x64` `.zip` for an Intel Mac, unzip it, and move **CastKit** to
  Applications. The app is **not signed** with an Apple Developer ID, so macOS
  refuses the first start of a downloaded copy. Remove the download mark once,
  in Terminal:

  ```sh
  xattr -dr com.apple.quarantine /Applications/CastKit.app
  ```

The app runs from the notification area (system tray; the menu bar on macOS).
Closing every window does not quit it; use **Quit CastKit** in the tray menu.
On Linux the tray icon needs a desktop with a system tray: GNOME shows one only
with the AppIndicator extension, which Ubuntu turns on by default. Without a
tray, start CastKit again to bring up the settings window.

On macOS the menu bar at the top of the screen follows the focused window:
**CastKit**, **Edit**, and the focused page window's **Window** menu. A click
on the Dock icon opens the settings window when no window is showing.

## Connect to your server

On the first launch the settings window opens and scans your network for
CastKit servers.

1. Select **Use this server** beside your server. If the scan finds nothing,
   select **Scan again**, or open **Enter an address** and type the address,
   for example `http://castkit.local:8788`.
2. Under **Open new windows on**, select the display and whether the window
   starts fullscreen. Hold the pointer over a display to frame that monitor.
3. Under **Pages on this server**, find the page and select **Open**. The
   screens come first, then each screen's views under that screen's name,
   then the views no screen shows. Type in the search box to filter the list.
   A page the list does not show, such as a `/d/<id>` device page, opens
   under **Open a page by its address**.

The scan tries `castkit.local` and `castkit`, then every address of each
local network (the /24 around this computer's address) on ports 8788 and
8789, and asks each open port whether it is CastKit (`GET /api/identity`).
When the server has a public address (`CASTKIT_PUBLIC_URL`) that answers
from this computer, the app uses that address. A server on another port or
another network is one typed address away.

Open the settings window again from the tray menu (**Server and settings…**),
from a window's menu, or by starting CastKit again. Changing the server
address keeps every window on the same page of the new server.

Only the configured server loads inside the app. A link to any other address
opens in your normal browser.

## Windows and displays

Every window has three menus with the same actions:

- the tray menu, which lists every window;
- the window's menu bar, which appears when you press Alt (in fullscreen,
  where no menu bar shows, Alt opens the window menu in the corner);
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
Disconnecting a monitor while CastKit is running preserves that placement too.
If the monitor returns with a different id, the saved id and menus are updated.

Closing a window with its X button keeps it, closed, with its page, monitor,
zoom levels, and sign-in. Open it again from the tray menu (**Open window**),
from **Your windows** in the settings window, or by starting CastKit again,
which opens every closed window. **Remove window** forgets a window for good.
Quitting the app keeps every window for the next launch.

## Zoom per view

Chromium keeps one zoom level per site, so in a browser every CastKit page
shares one zoom. In this app each window has its own browser session, and the
app saves a zoom level for every view a window shows. A screen that switches
from its agenda view to its music view switches zoom with it.

The sign-in is shared: a PIN typed in one window unlocks every window, and a
new window starts signed in. The app copies the server's sign-in cookie
between the windows' sessions; zoom stays separate.
Sign-in stays with its server when the server address changes. Removing a window
does not sign out the other windows.

The current page address, including its query and fragment, is saved as you
navigate, so reopening the app returns to the page you last used.

## Updating

Desktop updates are manual. Download the latest desktop release and rerun its
Windows installer, install the newer Linux package, or replace the extracted
app on macOS and portable installations. Saved windows and sign-in stay in the
user data folder. Updating the CastKit server updates its pages; it does not
replace the installed desktop app.

## Launch at login

Turn on **Launch at login** in the tray menu. It is off until you turn it on.

- **Windows:** the installed app starts through the stable `CastKit.exe` launcher
  beside `Update.exe`, so the setting survives updates. Older updater commands
  are repaired when the app starts. The checkbox also reflects whether Windows
  has disabled the startup entry in Task Manager or Settings.
- **macOS:** CastKit is added to the user's login items.
- **Linux:** Electron's login items do not cover Linux, so CastKit writes
  `~/.config/autostart/castkit.desktop` (under `$XDG_CONFIG_HOME` when set),
  which every XDG desktop starts at sign-in. It names the running executable,
  so turn the setting off and on again after moving an unzipped build.

## Where settings are stored

Everything is in one file, `desktop-state.json`, in the app's user data
folder: `%APPDATA%\CastKit` on Windows, `~/.config/CastKit` on Linux, and
`~/Library/Application Support/CastKit` on macOS. The file is written atomically. If it
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

`scripts/build.mjs` bundles the main process and both preloads into `dist/`
with esbuild, builds the settings page (React with `@charcuterie/ui`) with Vite
from `vite.settings.config.ts`, and renders the app icons from CastKit's mark.
The packaged app contains only `package.json` and `dist/`.

The release workflow (`.github/workflows/desktop-release.yml`) builds every
platform on its own runner: Windows (Squirrel installer and `.zip`), Linux
(`.deb` and `.zip`, x64 and arm64), and macOS (`.zip`, arm64 and x64). A push
of a `desktop-v<version>` tag publishes one release with all of them; a manual
run with a version does the same; a pull request that changes this package
only builds and uploads them as workflow artifacts. `make` here builds only for
the machine it runs on; a `.deb` needs `dpkg`, and the macOS build must run on
a Mac, because `codesign` re-signs the fused Electron binary.

## Security

Every page window runs with `contextIsolation`, `sandbox`, and no Node
integration. Its preload exposes nothing to the page; it only reports which
view is on screen. Pages cannot open new windows or attach `<webview>`, and
the only permission granted is fullscreen for the configured server. The
packaged app has Electron's fuses set so it cannot run as plain Node and loads
only from its integrity-checked archive.
