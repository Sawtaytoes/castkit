import { join } from "node:path"
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  powerMonitor,
  screen,
  Tray,
} from "electron"
import isSquirrelStartup from "electron-squirrel-startup"
import {
  buildApplicationMenu,
  buildTrayMenu,
  buildWindowMenuBar,
  buildWindowPopupMenu,
  type MenuActions,
} from "./appMenus.ts"
import {
  createWindowId,
  type DesktopState,
  loadDesktopState,
  saveDesktopState,
} from "./desktopState.ts"
import {
  identifyDisplays,
  readNumberedDisplays,
} from "./identifyOverlay.ts"
import { viewChannel } from "./ipcChannels.ts"
import {
  readLaunchAtLogin,
  writeLaunchAtLogin,
} from "./launchAtLogin.ts"
import { createSettingsWindow } from "./settingsWindow.ts"
import { createSharedSignIn } from "./sharedSignIn.ts"
import { createWindowManager } from "./windowManager.ts"

const log = (message: string) => {
  console.info(`[castkit-desktop] ${message}`)
}

const saveDelay = 500

const start = () => {
  const distDirectory = __dirname
  const iconPath = join(distDirectory, "icon.png")
  const stateFilePath =
    process.env.CASTKIT_DESKTOP_STATE_FILE ??
    join(app.getPath("userData"), "desktop-state.json")

  const loaded = loadDesktopState(stateFilePath)
  if (loaded.problem) {
    log(loaded.problem)
  }
  const settings: { serverOrigin: string | null } = {
    serverOrigin: loaded.state.serverOrigin,
  }
  const saveTimer: {
    handle?: ReturnType<typeof setTimeout>
  } = {}
  const tray: { icon: Tray | null } = { icon: null }

  const readServerOrigin = () => settings.serverOrigin

  const saveNow = () => {
    clearTimeout(saveTimer.handle)
    const state: DesktopState = {
      version: 1,
      serverOrigin: settings.serverOrigin,
      windows: windowManager.readRecords(),
    }
    try {
      saveDesktopState({ filePath: stateFilePath, state })
    } catch (error) {
      log(
        `Could not save ${stateFilePath}: ${String(error)}`,
      )
    }
  }

  const refreshMenus = () => {
    const displays = readNumberedDisplays()
    const isLaunchedAtLogin = readLaunchAtLogin()
    const entries = windowManager.readMenuEntries()
    tray.icon?.setContextMenu(
      Menu.buildFromTemplate(
        buildTrayMenu({
          entries,
          displays,
          isLaunchedAtLogin,
          actions,
        }),
      ),
    )
    if (process.platform === "darwin") {
      const focusedWindow = BrowserWindow.getFocusedWindow()
      Menu.setApplicationMenu(
        Menu.buildFromTemplate(
          buildApplicationMenu({
            entry:
              entries.find(
                (entry) =>
                  focusedWindow !== null &&
                  windowManager.readBrowserWindow(
                    entry.id,
                  ) === focusedWindow,
              ) ?? null,
            displays,
            isLaunchedAtLogin,
            actions,
          }),
        ),
      )
      return
    }
    entries.forEach((entry) => {
      windowManager.readBrowserWindow(entry.id)?.setMenu(
        Menu.buildFromTemplate(
          buildWindowMenuBar({
            entry,
            displays,
            isLaunchedAtLogin,
            actions,
          }),
        ),
      )
    })
  }

  const onRecordsChanged = () => {
    clearTimeout(saveTimer.handle)
    saveTimer.handle = setTimeout(saveNow, saveDelay)
    refreshMenus()
    settingsWindow.notifyChanged()
  }

  const sharedSignIn = createSharedSignIn({
    readServerOrigin,
    log,
  })

  const windowManager = createWindowManager({
    readServerOrigin,
    preloadPath: join(distDirectory, "viewPreload.cjs"),
    iconPath,
    onRecordsChanged,
    onWindowMenu: ({ windowId, isAtCorner }) => {
      const entry = windowManager
        .readMenuEntries()
        .find((candidate) => candidate.id === windowId)
      const browserWindow =
        windowManager.readBrowserWindow(windowId)
      if (entry && browserWindow) {
        Menu.buildFromTemplate(
          buildWindowPopupMenu({
            entry,
            displays: readNumberedDisplays(),
            actions,
          }),
        ).popup({
          window: browserWindow,
          ...(isAtCorner ? { x: 16, y: 16 } : {}),
        })
      }
    },
    attachSignIn: sharedSignIn.attach,
    detachSignIn: sharedSignIn.detach,
    log,
  })

  const settingsWindow = createSettingsWindow({
    distDirectory,
    iconPath,
    readServerOrigin,
    saveServerOrigin: (serverOrigin) => {
      if (serverOrigin === settings.serverOrigin) {
        return
      }
      settings.serverOrigin = serverOrigin
      windowManager.rebaseAll(serverOrigin)
      saveNow()
    },
    addWindow: ({ url, displayId, isFullScreen }) => {
      windowManager.add({
        id: createWindowId(),
        url,
        displayId,
        isFullScreen,
      })
    },
    readWindows: () =>
      windowManager.readMenuEntries().map((entry) => ({
        id: entry.id,
        title: entry.title,
        path: entry.path,
        displayId: entry.displayId,
        isOpen: entry.isOpen,
      })),
    openWindow: windowManager.open,
    removeWindow: windowManager.remove,
  })

  const actions: MenuActions = {
    openSettings: settingsWindow.open,
    identifyDisplays,
    openWindow: windowManager.open,
    toggleFullScreen: windowManager.toggleFullScreen,
    reload: windowManager.reload,
    zoom: windowManager.zoom,
    moveToDisplay: windowManager.moveToDisplay,
    removeWindow: windowManager.remove,
    setLaunchAtLogin: (isLaunchedAtLogin) => {
      writeLaunchAtLogin(isLaunchedAtLogin)
      refreshMenus()
    },
    quit: () => {
      app.quit()
    },
  }

  ipcMain.on(viewChannel, (event, view: unknown) => {
    windowManager.reportView({
      webContents: event.sender,
      view:
        typeof view === "string" && view.length <= 200
          ? view
          : null,
    })
  })

  const finishBeforeQuit = () => {
    saveNow()
    windowManager.beginQuit()
  }
  app.on("before-quit", finishBeforeQuit)
  // Windows does not raise `before-quit` when the session ends at sign-out
  // or shutdown, so save there too: `session-end` on Windows, `shutdown` on
  // the other platforms.
  powerMonitor.on("shutdown", finishBeforeQuit)
  app.on(
    "browser-window-created",
    (_event, browserWindow) => {
      browserWindow.on("session-end", finishBeforeQuit)
    },
  )

  // The tray keeps the app running with every window closed.
  app.on("window-all-closed", () => undefined)

  // Starting CastKit again (the Start menu, the desktop shortcut) opens
  // every closed window and the settings window, where any window can be
  // opened or removed.
  const reopenEverything = () => {
    windowManager
      .readMenuEntries()
      .filter((entry) => !entry.isOpen)
      .forEach((entry) => {
        windowManager.open(entry.id)
      })
    settingsWindow.open()
  }
  app.on("second-instance", reopenEverything)
  // macOS does not start a second instance: a click on the Dock icon or
  // opening the app again raises `activate` on the running one. It also
  // fires at the first launch, so it only brings up the settings window,
  // and only when nothing is showing; closed windows stay closed.
  app.on("activate", (_event, hasVisibleWindows) => {
    if (!hasVisibleWindows) {
      settingsWindow.open()
    }
  })
  // The macOS menu bar belongs to whichever window has the focus.
  if (process.platform === "darwin") {
    app.on("browser-window-focus", refreshMenus)
  }

  const onDisplaysChanged = () => {
    refreshMenus()
    settingsWindow.notifyChanged()
  }
  screen.on("display-added", () => {
    windowManager.returnWindowsToDisplays()
    onDisplaysChanged()
  })
  screen.on("display-removed", onDisplaysChanged)
  screen.on("display-metrics-changed", onDisplaysChanged)

  // `tray.png` is 16 px and `tray@2x.png` beside it is 32 px; Electron picks
  // the sharper one on a high-density display by itself.
  tray.icon = new Tray(
    nativeImage.createFromPath(
      join(distDirectory, "tray.png"),
    ),
  )
  tray.icon.setToolTip("CastKit")
  tray.icon.on("click", () => {
    tray.icon?.popUpContextMenu()
  })

  loaded.state.windows.forEach(windowManager.restore)
  refreshMenus()
  if (
    settings.serverOrigin === null ||
    loaded.state.windows.every((record) => record.isClosed)
  ) {
    settingsWindow.open()
  }
}

if (isSquirrelStartup) {
  // The Squirrel installer runs the app once to create its shortcuts; that
  // run must exit without opening windows.
  app.quit()
} else if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on("web-contents-created", (_event, webContents) => {
    webContents.on("will-attach-webview", (event) => {
      event.preventDefault()
    })
  })
  void app.whenReady().then(start)
}
