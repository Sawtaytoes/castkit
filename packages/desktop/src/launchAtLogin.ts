import {
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { dirname, join, win32 } from "node:path"
import { app } from "electron"

/**
 * A Squirrel install keeps each version in its own `app-<version>` folder, so
 * a login item that names the running executable breaks on the first update.
 * Squirrel's stub beside Update.exe starts the current version without any
 * command-line quoting. A portable build has no stub and starts directly.
 */
const windowsLaunchers = () => {
  if (process.platform !== "win32") {
    return undefined
  }
  const installDirectory = win32.resolve(
    win32.dirname(process.execPath),
    "..",
  )
  const executableName = win32.basename(process.execPath)
  const updater = win32.join(installDirectory, "Update.exe")
  const launcher = win32.join(
    installDirectory,
    executableName,
  )
  return existsSync(updater) && existsSync(launcher)
    ? { updater, launcher, executableName }
    : undefined
}

const loginItemTarget = () => {
  const launchers = windowsLaunchers()
  return launchers
    ? { path: launchers.launcher, args: [] }
    : {}
}

// Electron 44.7 parses the approval lookup's path as a command line. Quote
// it for that lookup when needed, while keeping the registration comparison
// unquoted. Otherwise a space in the install path hides an enabled entry.
const readWindowsLoginItemSettings = (target: {
  path?: string
  args?: string[]
}) => {
  const settings = app.getLoginItemSettings(target)
  if (
    !settings.openAtLogin ||
    settings.executableWillLaunchAtLogin
  ) {
    return settings
  }
  const approval = app.getLoginItemSettings({
    ...target,
    path: `"${target.path ?? process.execPath}"`,
  })
  return {
    ...settings,
    executableWillLaunchAtLogin:
      approval.executableWillLaunchAtLogin,
  }
}

/** Repair the old double-quoted updater command, preserving Windows' disabled state. */
export const migrateLaunchAtLogin = () => {
  const launchers = windowsLaunchers()
  if (!launchers) {
    return
  }
  const legacy = readWindowsLoginItemSettings({
    path: launchers.updater,
    args: [
      "--processStart",
      `"${launchers.executableName}"`,
    ],
  })
  if (!legacy.openAtLogin) {
    return
  }
  app.setLoginItemSettings({
    ...loginItemTarget(),
    openAtLogin: true,
    enabled: legacy.executableWillLaunchAtLogin,
  })
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
export const readLaunchAtLogin = () => {
  if (process.platform === "linux") {
    return existsSync(autostartPath())
  }
  const settings =
    process.platform === "win32"
      ? readWindowsLoginItemSettings(loginItemTarget())
      : app.getLoginItemSettings(loginItemTarget())
  return (
    settings.openAtLogin &&
    (process.platform !== "win32" ||
      settings.executableWillLaunchAtLogin)
  )
}

/** Start CastKit when this user signs in, or stop doing so. */
export const writeLaunchAtLogin = (
  isLaunchedAtLogin: boolean,
) => {
  if (process.platform !== "linux") {
    app.setLoginItemSettings({
      openAtLogin: isLaunchedAtLogin,
      ...loginItemTarget(),
      ...(process.platform === "win32"
        ? { enabled: isLaunchedAtLogin }
        : {}),
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
