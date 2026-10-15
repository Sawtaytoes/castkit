# The desktop app ships for Linux and macOS, and the Mac build is unsigned

Status: Accepted
Date: 2026-10-14
Type: Platform
Supersedes: None
Superseded by: None

## Decision

1. **Every desktop release carries Windows, Linux, and macOS.** One `desktop-v<version>` tag builds each platform on its own GitHub runner and publishes one release: Windows (Squirrel `Setup.exe` and `.zip`), Linux (`.deb` and `.zip`, x64 and arm64), and macOS (`.zip`, arm64 and x64).
2. **Linux ships as a `.deb` and a `.zip`; no AppImage, Flatpak, or `.rpm` yet.** The `.deb` comes from Forge's own `@electron-forge/maker-deb` (Electron project maintainers), which sets `chrome-sandbox` setuid root. That is what lets the app start on Ubuntu 24.04 and later, which block the unprivileged user namespaces Electron's sandbox otherwise uses. An unzipped build cannot do that, and the README says so. An AppImage maker would be a third-party Forge plugin, so it waits for a request.
3. **The macOS build is not signed or notarized.** That needs a paid Apple Developer ID. The fuses plugin re-signs the edited Electron binary ad hoc (`resetAdHocDarwinSignature`), without which Apple silicon refuses to start it at all; a downloaded copy still needs `xattr -dr com.apple.quarantine /Applications/CastKit.app` once. No `.dmg`: unsigned, it adds a mount step and nothing else.
4. **Launch at login works on Linux through an XDG autostart file.** Electron's `setLoginItemSettings` covers only Windows and macOS. On Linux, CastKit writes `castkit.desktop` into `$XDG_CONFIG_HOME/autostart` (default `~/.config/autostart`), naming the running executable (or `$APPIMAGE`). It stays off until turned on, as on the other platforms.
5. **macOS gets an app-wide menu bar that follows the focused window.** macOS ignores `BrowserWindow.setMenu`, so `Menu.setApplicationMenu` carries **CastKit** (with Hide and Command-Q), **Edit** (without it Command-C and Command-V do nothing in the settings fields), and the focused page window's **Window** menu. A Dock click opens the settings window when nothing is showing; it does not reopen closed windows, because macOS also raises `activate` at the first launch.

## Context

The owner asked for Linux and Mac builds on 2026-10-14. Until then the release workflow had a single Windows job, and the Forge config already listed `linux` for its `.zip` maker but nothing built it.

## Why

- The app bundles every dependency into `dist/` and has no native module, so each runner can build its own architecture and cross-build the other with no extra toolchain.
- A tray app that cannot start at login is half a kiosk shell; the Linux autostart file is the standard every XDG desktop reads.
- Signing is a cost decision for the owner, not a build step an agent can supply.

## Evidence

- Owner, 2026-10-14: *"Also, can we produce a Linux and Mac buiuld?"* (T3 Code thread bfbdc019-bd43-45f4-9e7e-df2c7214a3e5).
- Local Linux build: `electron-forge make --platform linux --arch x64` produced `castkit_0.2.0_amd64.deb` (setuid-root `chrome-sandbox`, `/usr/bin/castkit`, a desktop entry and icon) and the `.zip`; the packaged binary started under Xvfb and created its profile.
- The macOS build is proven by the `macos` job of the release workflow on the pull request that added it.
