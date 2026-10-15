import {
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { basename, dirname, join, resolve } from "node:path"
import { app } from "electron"

/**
 * A Squirrel install keeps each version in its own `app-<version>` folder, so
 * a login item that names the running executable breaks on the first update.
 * Electron's documented fix is to start through Squirrel's `Update.exe`, which
 * always launches the current version.
 */
const loginItemTarget = () => {
  const updateExecutable = resolve(
    dirname(process.execPath),
    "..",
    "Update.exe",
  )
  return process.platform === "win32" &&
    existsSync(updateExecutable)
    ? {
        path: updateExecutable,
        args: [
          "--processStart",
          `"${basename(process.execPath)}"`,
        ],
      }
    : {}
}

/**
 * Electron's login items cover Windows and macOS only. A Linux desktop starts
 * whatever has an entry in the XDG autostart folder, so that file is the
 * login item there.
 */
export const readAutostartPath = ({
  configHome,
  home,
}: {
  configHome: string | undefined
  home: string
}) =>
  join(
    configHome || join(home, ".config"),
    "autostart",
    "castkit.desktop",
  )

/**
 * The autostart entry for the running app. The Exec key quotes its path, so
 * a folder with a space in it (an unzipped build) still starts.
 */
export const buildAutostartEntry = (
  executablePath: string,
) =>
  [
    "[Desktop Entry]",
    "Type=Application",
    "Name=CastKit",
    "Comment=Show CastKit pages in windows on your displays",
    `Exec="${executablePath.replaceAll('"', '\\"')}"`,
    "Terminal=false",
    "X-GNOME-Autostart-enabled=true",
    "",
  ].join("\n")

const autostartPath = () =>
  readAutostartPath({
    configHome: process.env.XDG_CONFIG_HOME,
    home: app.getPath("home"),
  })

/** Whether CastKit starts when this user signs in. */
export const readLaunchAtLogin = () =>
  process.platform === "linux"
    ? existsSync(autostartPath())
    : app.getLoginItemSettings(loginItemTarget())
        .openAtLogin

/** Start CastKit when this user signs in, or stop doing so. */
export const writeLaunchAtLogin = (
  isLaunchedAtLogin: boolean,
) => {
  if (process.platform !== "linux") {
    app.setLoginItemSettings({
      openAtLogin: isLaunchedAtLogin,
      ...loginItemTarget(),
    })
    return
  }
  const filePath = autostartPath()
  if (!isLaunchedAtLogin) {
    rmSync(filePath, { force: true })
    return
  }
  mkdirSync(dirname(filePath), { recursive: true })
  // An AppImage runs from a temporary mount; APPIMAGE names the file itself.
  writeFileSync(
    filePath,
    buildAutostartEntry(
      process.env.APPIMAGE ?? process.execPath,
    ),
  )
}
