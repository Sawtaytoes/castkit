import { join } from "node:path"
import {
  app,
  ipcMain,
  Menu,
  nativeImage,
  powerMonitor,
  screen,
  Tray,
} from "electron"
import isSquirrelStartup from "electron-squirrel-startup"
import {
  buildTrayMenu,
  buildWindowMenu,
  buildWindowMenuBar,
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
  }

  const windowManager = createWindowManager({
    readServerOrigin,
    preloadPath: join(distDirectory, "viewPreload.cjs"),
    iconPath,
    onRecordsChanged,
    onWindowContextMenu: (windowId) => {
      const entry = windowManager
        .readMenuEntries()
        .find((candidate) => candidate.id === windowId)
      const browserWindow =
        windowManager.readBrowserWindow(windowId)
      if (entry && browserWindow) {
        Menu.buildFromTemplate(
          buildWindowMenu({
            entry,
            displays: readNumberedDisplays(),
            actions,
          }),
        ).popup({ window: browserWindow })
      }
    },
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
  })

  const actions: MenuActions = {
    openSettings: settingsWindow.open,
    identifyDisplays,
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

  app.on("second-instance", () => {
    settingsWindow.open()
  })

  screen.on("display-added", () => {
    windowManager.returnWindowsToDisplays()
    refreshMenus()
  })
  screen.on("display-removed", refreshMenus)
  screen.on("display-metrics-changed", refreshMenus)

  tray.icon = new Tray(
    nativeImage
      .createFromPath(join(distDirectory, "tray.png"))
      .resize({ width: 16, height: 16 }),
  )
  tray.icon.setToolTip("CastKit")
  tray.icon.on("click", () => {
    tray.icon?.popUpContextMenu()
  })

  loaded.state.windows.forEach(windowManager.restore)
  refreshMenus()
  if (
    settings.serverOrigin === null ||
    loaded.state.windows.length === 0
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
