import { networkInterfaces } from "node:os"
import { join } from "node:path"
import {
  BrowserWindow,
  ipcMain,
  nativeTheme,
} from "electron"
import { fetchCastkitPages } from "./castkitTargets.ts"
import {
  normalizeServerOrigin,
  resolvePageUrl,
} from "./castkitUrl.ts"
import {
  clearDisplayHighlight,
  highlightDisplay,
  readNumberedDisplays,
} from "./identifyOverlay.ts"
import {
  addWindowChannel,
  highlightDisplayChannel,
  openWindowChannel,
  readPagesChannel,
  readSettingsChannel,
  removeWindowChannel,
  savePcAudioChannel,
  saveServerOriginChannel,
  scanServersChannel,
  settingsChangedChannel,
} from "./ipcChannels.ts"
import {
  findServers,
  listScanNetworks,
  listScanOrigins,
} from "./serverDiscovery.ts"
import type {
  PagesResult,
  PcAudioSnapshot,
  ScanResult,
  SettingsResult,
  SettingsSnapshot,
} from "./settings/settingsApi.ts"

/** A window as the main process describes it to the settings page. */
type WindowSummary = {
  id: string
  title: string
  path: string
  displayId: number
  isOpen: boolean
}

/**
 * The settings window: finding the server, adding windows, and every window
 * the app keeps, open or closed. It is a local page the app ships, reached
 * only through the handlers below, each of which checks that the request
 * came from this window.
 */
export const createSettingsWindow = ({
  distDirectory,
  iconPath,
  readServerOrigin,
  saveServerOrigin,
  addWindow,
  readWindows,
  openWindow,
  removeWindow,
  readPcAudio,
  changePcAudio,
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
  readWindows: () => WindowSummary[]
  openWindow: (windowId: string) => void
  removeWindow: (windowId: string) => void
  readPcAudio: () => PcAudioSnapshot
  changePcAudio: (change: unknown) => SettingsResult
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

  const readWindowId = (input: unknown) =>
    typeof input === "string" &&
    readWindows().some((summary) => summary.id === input)
      ? input
      : null

  ipcMain.handle(
    readSettingsChannel,
    (event): SettingsSnapshot | null => {
      if (!isFromSettings(event.sender.id)) {
        return null
      }
      const displays = readNumberedDisplays()
      return {
        serverOrigin: readServerOrigin(),
        displays: displays.map((display) => ({
          id: display.id,
          number: display.number,
          label: display.label || "Display",
          width: display.bounds.width,
          height: display.bounds.height,
          isPrimary: display.isPrimary,
        })),
        windows: readWindows().map((summary) => ({
          id: summary.id,
          title: summary.title,
          path: summary.path,
          displayNumber:
            displays.find(
              (display) => display.id === summary.displayId,
            )?.number ?? null,
          isOpen: summary.isOpen,
        })),
        pcAudio: readPcAudio(),
      }
    },
  )

  ipcMain.handle(
    savePcAudioChannel,
    (event, change: unknown): SettingsResult =>
      isFromSettings(event.sender.id)
        ? changePcAudio(change)
        : refused,
  )

  ipcMain.handle(
    readPagesChannel,
    async (event): Promise<PagesResult> => {
      if (!isFromSettings(event.sender.id)) {
        return { pages: [], error: refused.error }
      }
      const serverOrigin = readServerOrigin()
      return serverOrigin
        ? fetchCastkitPages(serverOrigin)
        : { pages: [], error: "Choose a server first." }
    },
  )

  ipcMain.handle(
    scanServersChannel,
    async (event): Promise<ScanResult> => {
      if (!isFromSettings(event.sender.id)) {
        return { servers: [], networks: [] }
      }
      const networks = listScanNetworks(networkInterfaces())
      return {
        servers: await findServers({
          origins: listScanOrigins(networks),
        }),
        networks: networks.map((network) => `${network}.x`),
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
          error: "Choose a server first.",
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

  ipcMain.handle(
    openWindowChannel,
    (event, input: unknown): SettingsResult => {
      if (!isFromSettings(event.sender.id)) {
        return refused
      }
      const windowId = readWindowId(input)
      if (!windowId) {
        return {
          isDone: false,
          error: "That window no longer exists.",
        }
      }
      openWindow(windowId)
      return { isDone: true }
    },
  )

  ipcMain.handle(
    removeWindowChannel,
    (event, input: unknown): SettingsResult => {
      if (!isFromSettings(event.sender.id)) {
        return refused
      }
      const windowId = readWindowId(input)
      if (!windowId) {
        return {
          isDone: false,
          error: "That window no longer exists.",
        }
      }
      removeWindow(windowId)
      return { isDone: true }
    },
  )

  ipcMain.on(
    highlightDisplayChannel,
    (event, displayId: unknown) => {
      if (!isFromSettings(event.sender.id)) {
        return
      }
      if (typeof displayId === "number") {
        highlightDisplay(displayId)
      } else {
        clearDisplayHighlight()
      }
    },
  )

  /** Tell an open settings page that the windows or the displays changed. */
  const notifyChanged = () => {
    if (current.window && !current.window.isDestroyed()) {
      current.window.webContents.send(
        settingsChangedChannel,
      )
    }
  }

  /** Open the settings window, or bring it forward if it is open. */
  const open = () => {
    if (current.window && !current.window.isDestroyed()) {
      current.window.show()
      current.window.focus()
      return
    }
    const settingsWindow = new BrowserWindow({
      width: 1040,
      height: 760,
      minWidth: 480,
      minHeight: 420,
      title: "CastKit settings",
      icon: iconPath,
      autoHideMenuBar: true,
      backgroundColor: nativeTheme.shouldUseDarkColors
        ? "#0f1115"
        : "#ffffff",
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
    // A highlight left behind by a pointer that never sent its "leave".
    settingsWindow.on("blur", clearDisplayHighlight)
    settingsWindow.on("closed", () => {
      clearDisplayHighlight()
      current.window = null
    })
    void settingsWindow.loadFile(
      join(distDirectory, "settings", "index.html"),
    )
  }

  return { open, notifyChanged }
}
