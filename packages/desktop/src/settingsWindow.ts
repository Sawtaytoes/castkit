import { join } from "node:path"
import { BrowserWindow, ipcMain } from "electron"
import { fetchCastkitTargets } from "./castkitTargets.ts"
import {
  normalizeServerOrigin,
  resolvePageUrl,
} from "./castkitUrl.ts"
import { readNumberedDisplays } from "./identifyOverlay.ts"
import {
  addWindowChannel,
  readSettingsChannel,
  saveServerOriginChannel,
} from "./ipcChannels.ts"
import type {
  SettingsResult,
  SettingsSnapshot,
} from "./settings/settingsApi.ts"

/**
 * The settings window: the server address and "Add window". It is a local
 * page the app ships, reached only through the three handlers below.
 */
export const createSettingsWindow = ({
  distDirectory,
  iconPath,
  readServerOrigin,
  saveServerOrigin,
  addWindow,
}: {
  distDirectory: string
  iconPath: string
  readServerOrigin: () => string | null
  saveServerOrigin: (serverOrigin: string) => void
  addWindow: (request: {
    url: string
    displayId: number
    isFullScreen: boolean
  }) => void
}) => {
  const current: { window: BrowserWindow | null } = {
    window: null,
  }

  const isFromSettings = (senderId: number) =>
    current.window !== null &&
    !current.window.isDestroyed() &&
    current.window.webContents.id === senderId

  const refused: SettingsResult = {
    isDone: false,
    error: "Only the settings window can change settings.",
  }

  ipcMain.handle(
    readSettingsChannel,
    async (event): Promise<SettingsSnapshot | null> => {
      if (!isFromSettings(event.sender.id)) {
        return null
      }
      const serverOrigin = readServerOrigin()
      return {
        serverOrigin,
        displays: readNumberedDisplays().map(
          ({ id, name, isPrimary }) => ({
            id,
            name,
            isPrimary,
          }),
        ),
        targets: serverOrigin
          ? await fetchCastkitTargets(serverOrigin)
          : [],
      }
    },
  )

  ipcMain.handle(
    saveServerOriginChannel,
    (event, input: unknown): SettingsResult => {
      if (!isFromSettings(event.sender.id)) {
        return refused
      }
      const serverOrigin =
        typeof input === "string"
          ? normalizeServerOrigin(input)
          : null
      if (!serverOrigin) {
        return {
          isDone: false,
          error:
            "Enter an http or https address, for example http://castkit.local:8788.",
        }
      }
      saveServerOrigin(serverOrigin)
      return { isDone: true }
    },
  )

  ipcMain.handle(
    addWindowChannel,
    (event, request: unknown): SettingsResult => {
      if (!isFromSettings(event.sender.id)) {
        return refused
      }
      const serverOrigin = readServerOrigin()
      if (!serverOrigin) {
        return {
          isDone: false,
          error: "Save the server address first.",
        }
      }
      if (
        typeof request !== "object" ||
        request === null ||
        !("page" in request) ||
        typeof request.page !== "string" ||
        !("displayId" in request) ||
        typeof request.displayId !== "number" ||
        !("isFullScreen" in request) ||
        typeof request.isFullScreen !== "boolean"
      ) {
        return {
          isDone: false,
          error: "The request is malformed.",
        }
      }
      const resolved = resolvePageUrl({
        input: request.page,
        serverOrigin,
      })
      if ("error" in resolved) {
        return { isDone: false, error: resolved.error }
      }
      addWindow({
        url: resolved.url,
        displayId: request.displayId,
        isFullScreen: request.isFullScreen,
      })
      return { isDone: true }
    },
  )

  /** Open the settings window, or bring it forward if it is open. */
  const open = () => {
    if (current.window && !current.window.isDestroyed()) {
      current.window.show()
      current.window.focus()
      return
    }
    const settingsWindow = new BrowserWindow({
      width: 560,
      height: 600,
      title: "CastKit settings",
      icon: iconPath,
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(distDirectory, "settingsPreload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webviewTag: false,
      },
    })
    settingsWindow.setMenu(null)
    settingsWindow.webContents.on(
      "will-navigate",
      (event) => {
        event.preventDefault()
      },
    )
    settingsWindow.webContents.setWindowOpenHandler(() => ({
      action: "deny",
    }))
    current.window = settingsWindow
    settingsWindow.on("closed", () => {
      current.window = null
    })
    void settingsWindow.loadFile(
      join(distDirectory, "settings", "settings.html"),
    )
  }

  return { open }
}
