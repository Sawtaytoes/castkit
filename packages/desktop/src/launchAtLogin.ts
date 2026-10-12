import { existsSync } from "node:fs"
import { basename, dirname, resolve } from "node:path"
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

/** Whether CastKit starts when this user signs in. */
export const readLaunchAtLogin = () =>
  app.getLoginItemSettings(loginItemTarget()).openAtLogin

/** Start CastKit when this user signs in, or stop doing so. */
export const writeLaunchAtLogin = (
  isLaunchedAtLogin: boolean,
) => {
  app.setLoginItemSettings({
    openAtLogin: isLaunchedAtLogin,
    ...loginItemTarget(),
  })
}
