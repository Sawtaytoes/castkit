import {
  BrowserWindow,
  type Input,
  type Rectangle,
  screen,
  session,
  shell,
  type WebContents,
} from "electron"
import {
  isAllowedNavigation,
  isExternalWebUrl,
  rebaseUrl,
} from "./castkitUrl.ts"
import type { SavedWindow } from "./desktopState.ts"
import {
  type DisplaySnapshot,
  matchDisplay,
  placeWindowBounds,
} from "./displayMatching.ts"
import {
  readZoomFactor,
  resolveViewKey,
  stepZoomFactor,
  writeZoomFactor,
} from "./zoomByView.ts"

/** A zoom request from a key, the menu, or Ctrl + mouse wheel. */
export type ZoomRequest = "in" | "out" | "reset"

type ManagedWindow = {
  record: SavedWindow
  browserWindow: BrowserWindow
  reportedView: string | null
  /** True while the window sits on the primary display because its own monitor is missing. */
  isOnFallbackDisplay: boolean
  /** True until the restored window is shown, so its own placement does not overwrite the saved one. */
  isPlacing: boolean
  /** The last view and factor logged, so a repeated report is not logged again. */
  appliedZoom: string
}

const reloadDelay = 10_000
const showDeadline = 5000
const secondPlacementDelay = 150

/** Read the display and bounds a window has right now, ready to save. */
const capturePlacement = (browserWindow: BrowserWindow) => {
  const display = screen.getDisplayMatching(
    browserWindow.getBounds(),
  )
  const windowBounds =
    browserWindow.isFullScreen() ||
    browserWindow.isMaximized()
      ? browserWindow.getNormalBounds()
      : browserWindow.getBounds()
  return {
    displayId: display.id,
    displayLabel: display.label,
    displayBounds: display.bounds,
    windowBounds,
  }
}

/** Which keys the app handles itself. Each one works in fullscreen too, where no menu bar shows. */
const readShortcut = (input: Input) => {
  if (input.type !== "keyDown") {
    return null
  }
  const isControl = input.control || input.meta
  if (input.code === "F11") {
    return "fullscreen"
  }
  if (
    input.code === "F5" ||
    (isControl && input.code === "KeyR")
  ) {
    return "reload"
  }
  if (!isControl) {
    return null
  }
  if (
    input.code === "Equal" ||
    input.code === "NumpadAdd"
  ) {
    return "zoom-in"
  }
  if (
    input.code === "Minus" ||
    input.code === "NumpadSubtract"
  ) {
    return "zoom-out"
  }
  if (input.code === "Digit0" || input.code === "Numpad0") {
    return "zoom-reset"
  }
  return null
}

/**
 * Owns every CastKit page window: creates and restores them, keeps their
 * saved records current, and applies each window's zoom per view.
 */
export const createWindowManager = ({
  readServerOrigin,
  preloadPath,
  iconPath,
  onRecordsChanged,
  onWindowContextMenu,
  log,
}: {
  readServerOrigin: () => string | null
  preloadPath: string
  iconPath: string
  /** Called after any change a restart must remember, and after any change the menus show. */
  onRecordsChanged: () => void
  /** A right click with the mouse opens the window's own menu. */
  onWindowContextMenu: (windowId: string) => void
  log: (message: string) => void
}) => {
  const managedWindows = new Map<string, ManagedWindow>()
  const lifecycle = { isQuitting: false }

  const findByWebContents = (webContents: WebContents) =>
    [...managedWindows.values()].find(
      (managed) =>
        !managed.browserWindow.isDestroyed() &&
        managed.browserWindow.webContents.id ===
          webContents.id,
    )

  const updateRecord = ({
    windowId,
    change,
  }: {
    windowId: string
    change: Partial<SavedWindow>
  }) => {
    const managed = managedWindows.get(windowId)
    if (!managed) {
      return
    }
    managed.record = { ...managed.record, ...change }
    onRecordsChanged()
  }

  const applyZoom = (managed: ManagedWindow) => {
    if (managed.browserWindow.isDestroyed()) {
      return
    }
    const viewKey = resolveViewKey({
      reportedView: managed.reportedView,
      url: managed.browserWindow.webContents.getURL(),
    })
    const factor = readZoomFactor({
      zoomByView: managed.record.zoomByView,
      viewKey,
    })
    const applied = `${viewKey} at ${Math.round(factor * 100)}%`
    if (applied !== managed.appliedZoom) {
      managed.appliedZoom = applied
      log(`Window ${managed.record.id} shows ${applied}.`)
    }
    managed.browserWindow.webContents.setZoomFactor(factor)
  }

  const zoom = ({
    windowId,
    request,
  }: {
    windowId: string
    request: ZoomRequest
  }) => {
    const managed = managedWindows.get(windowId)
    if (!managed || managed.browserWindow.isDestroyed()) {
      return
    }
    const { webContents } = managed.browserWindow
    const viewKey = resolveViewKey({
      reportedView: managed.reportedView,
      url: webContents.getURL(),
    })
    const factor =
      request === "reset"
        ? 1
        : stepZoomFactor({
            factor: webContents.getZoomFactor(),
            direction: request,
          })
    updateRecord({
      windowId,
      change: {
        zoomByView: writeZoomFactor({
          zoomByView: managed.record.zoomByView,
          viewKey,
          factor,
        }),
      },
    })
    applyZoom(managed)
  }

  const toggleFullScreen = (windowId: string) => {
    const managed = managedWindows.get(windowId)
    if (managed && !managed.browserWindow.isDestroyed()) {
      managed.browserWindow.setFullScreen(
        !managed.browserWindow.isFullScreen(),
      )
    }
  }

  const reload = (windowId: string) => {
    const managed = managedWindows.get(windowId)
    if (managed && !managed.browserWindow.isDestroyed()) {
      managed.browserWindow.webContents.reload()
    }
  }

  /**
   * Put a window on a display at the given bounds, fullscreen or not. The
   * bounds are set twice — the mixed-DPI fix from Image-Viewer: the first
   * `setBounds` onto a monitor whose scale factor differs from the one the
   * window is on is mapped in the wrong DIP space, and the window comes out
   * too small. The second, once Windows has moved the window to that monitor,
   * lands exactly. Fullscreen is entered last, on the right monitor.
   */
  const placeOnDisplay = ({
    browserWindow,
    bounds,
    isFullScreen,
    onPlaced,
  }: {
    browserWindow: BrowserWindow
    bounds: Rectangle
    isFullScreen: boolean
    onPlaced?: () => void
  }) => {
    if (browserWindow.isFullScreen()) {
      browserWindow.setFullScreen(false)
    }
    browserWindow.setBounds(bounds)
    setTimeout(() => {
      if (browserWindow.isDestroyed()) {
        return
      }
      browserWindow.setBounds(bounds)
      if (isFullScreen) {
        browserWindow.setFullScreen(true)
      }
      onPlaced?.()
    }, secondPlacementDelay)
  }

  const moveToDisplay = ({
    windowId,
    displayId,
  }: {
    windowId: string
    displayId: number
  }) => {
    const managed = managedWindows.get(windowId)
    const display = screen
      .getAllDisplays()
      .find((candidate) => candidate.id === displayId)
    if (
      !managed ||
      managed.browserWindow.isDestroyed() ||
      !display
    ) {
      return
    }
    const isFullScreen =
      managed.browserWindow.isFullScreen()
    managed.isOnFallbackDisplay = false
    placeOnDisplay({
      browserWindow: managed.browserWindow,
      bounds: display.workArea,
      isFullScreen,
      onPlaced: () => {
        updateRecord({
          windowId,
          change: {
            ...capturePlacement(managed.browserWindow),
            isFullScreen,
          },
        })
      },
    })
  }

  const guardNavigation = (webContents: WebContents) => {
    const openOutside = (url: string) => {
      if (isExternalWebUrl(url)) {
        void shell.openExternal(url)
      }
    }
    const isInsideApp = (url: string) => {
      const serverOrigin = readServerOrigin()
      return serverOrigin !== null
        ? isAllowedNavigation({ url, serverOrigin })
        : false
    }
    webContents.on("will-navigate", (event) => {
      if (!isInsideApp(event.url)) {
        event.preventDefault()
        openOutside(event.url)
      }
    })
    webContents.on("will-redirect", (event) => {
      if (!isInsideApp(event.url)) {
        event.preventDefault()
        openOutside(event.url)
      }
    })
    webContents.setWindowOpenHandler(({ url }) => {
      openOutside(url)
      return { action: "deny" }
    })
  }

  const guardSession = (partition: string) => {
    const partitionSession =
      session.fromPartition(partition)
    const isFromServer = (url: string) => {
      const serverOrigin = readServerOrigin()
      return serverOrigin !== null
        ? isAllowedNavigation({ url, serverOrigin })
        : false
    }
    partitionSession.setPermissionRequestHandler(
      (_webContents, permission, callback, details) => {
        callback(
          permission === "fullscreen" &&
            isFromServer(details.requestingUrl),
        )
      },
    )
  }

  const createPageWindow = ({
    record,
    bounds,
    isOnFallbackDisplay,
  }: {
    record: SavedWindow
    bounds: Rectangle
    isOnFallbackDisplay: boolean
  }) => {
    const partition = `persist:castkit-window-${record.id}`
    guardSession(partition)
    const browserWindow = new BrowserWindow({
      ...bounds,
      title: "CastKit",
      icon: iconPath,
      show: false,
      autoHideMenuBar: true,
      backgroundColor: "#000000",
      webPreferences: {
        partition,
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webviewTag: false,
        spellcheck: false,
        // A display window is often not focused and may be covered; it must
        // keep updating, and the later Sendspin player must keep playing.
        backgroundThrottling: false,
        autoplayPolicy: "no-user-gesture-required",
      },
    })
    const managed: ManagedWindow = {
      record,
      browserWindow,
      reportedView: null,
      isOnFallbackDisplay,
      isPlacing: true,
      appliedZoom: "",
    }
    managedWindows.set(record.id, managed)
    const { webContents } = browserWindow
    guardNavigation(webContents)

    const hasStartedPlacing = { value: false }
    const finishPlacing = () => {
      if (
        hasStartedPlacing.value ||
        browserWindow.isDestroyed()
      ) {
        return
      }
      hasStartedPlacing.value = true
      browserWindow.show()
      placeOnDisplay({
        browserWindow,
        bounds,
        isFullScreen: record.isFullScreen,
        onPlaced: () => {
          managed.isPlacing = false
        },
      })
    }
    browserWindow.once("ready-to-show", finishPlacing)
    // A server that is down at login never paints a first frame, so the
    // window would stay hidden; show it anyway after a short wait.
    setTimeout(finishPlacing, showDeadline)

    const savePlacement = () => {
      if (
        managed.isPlacing ||
        managed.isOnFallbackDisplay ||
        browserWindow.isDestroyed()
      ) {
        return
      }
      updateRecord({
        windowId: record.id,
        change: capturePlacement(browserWindow),
      })
    }
    browserWindow.on("move", savePlacement)
    browserWindow.on("resize", savePlacement)
    browserWindow.on("enter-full-screen", () => {
      if (!managed.isPlacing) {
        updateRecord({
          windowId: record.id,
          change: { isFullScreen: true },
        })
      }
    })
    browserWindow.on("leave-full-screen", () => {
      if (!managed.isPlacing) {
        updateRecord({
          windowId: record.id,
          change: { isFullScreen: false },
        })
      }
    })

    webContents.on("before-input-event", (event, input) => {
      const shortcut = readShortcut(input)
      if (!shortcut) {
        return
      }
      event.preventDefault()
      if (shortcut === "fullscreen") {
        toggleFullScreen(record.id)
      } else if (shortcut === "reload") {
        reload(record.id)
      } else if (shortcut === "zoom-in") {
        zoom({ windowId: record.id, request: "in" })
      } else if (shortcut === "zoom-out") {
        zoom({ windowId: record.id, request: "out" })
      } else {
        zoom({ windowId: record.id, request: "reset" })
      }
    })
    webContents.on("zoom-changed", (_event, direction) => {
      zoom({ windowId: record.id, request: direction })
    })
    webContents.on("context-menu", (_event, params) => {
      // A long press on a touch monitor also raises `context-menu`; only a
      // mouse or keyboard request opens the menu, so a touch view stays usable.
      if (
        params.menuSourceType === "mouse" ||
        params.menuSourceType === "keyboard"
      ) {
        onWindowContextMenu(record.id)
      }
    })
    webContents.on("did-navigate", () => {
      managed.reportedView = null
      applyZoom(managed)
    })
    webContents.on("did-finish-load", () => {
      applyZoom(managed)
    })
    webContents.on(
      "did-fail-load",
      (
        _event,
        errorCode,
        errorDescription,
        failedUrl,
        isMainFrame,
      ) => {
        // -3 is ERR_ABORTED: a navigation replaced this one, nothing failed.
        if (!isMainFrame || errorCode === -3) {
          return
        }
        log(
          `Window ${record.id} could not load ${failedUrl} (${errorDescription}); retrying in ${reloadDelay / 1000} s.`,
        )
        setTimeout(() => {
          if (!browserWindow.isDestroyed()) {
            void browserWindow
              .loadURL(managed.record.url)
              .catch(() => undefined)
          }
        }, reloadDelay)
      },
    )
    browserWindow.on("page-title-updated", () => {
      onRecordsChanged()
    })
    browserWindow.on("closed", () => {
      // Quitting closes every window, and those windows must open again at
      // the next launch. Any other close is the person removing the window.
      if (!lifecycle.isQuitting) {
        forget(record.id)
      }
    })

    // `did-fail-load` above logs a failure and schedules the retry.
    void browserWindow
      .loadURL(record.url)
      .catch(() => undefined)
    return managed
  }

  /** Open a saved window where it was, on the monitor it was on. */
  const restore = (record: SavedWindow) => {
    const displays: DisplaySnapshot[] =
      screen.getAllDisplays()
    const { display, matchedBy } = matchDisplay({
      displays,
      placement: record,
      primaryDisplayId: screen.getPrimaryDisplay().id,
    })
    if (matchedBy === "primary-fallback") {
      log(
        `Window ${record.id}: display "${record.displayLabel}" (id ${record.displayId}) is not connected; showing it on the primary display until it returns.`,
      )
    } else if (matchedBy !== "id") {
      log(
        `Window ${record.id}: display id ${record.displayId} changed; found the monitor by ${matchedBy}.`,
      )
    }
    createPageWindow({
      record,
      bounds: placeWindowBounds({
        placement: record,
        display,
      }),
      isOnFallbackDisplay: matchedBy === "primary-fallback",
    })
  }

  /** A monitor came back: return the windows that were waiting for it. */
  const returnWindowsToDisplays = () => {
    const displays = screen.getAllDisplays()
    const primaryDisplayId = screen.getPrimaryDisplay().id
    managedWindows.forEach((managed) => {
      if (
        !managed.isOnFallbackDisplay ||
        managed.browserWindow.isDestroyed()
      ) {
        return
      }
      const { display, matchedBy } = matchDisplay({
        displays,
        placement: managed.record,
        primaryDisplayId,
      })
      if (matchedBy === "primary-fallback") {
        return
      }
      log(
        `Window ${managed.record.id}: display "${managed.record.displayLabel}" is back; returning the window to it.`,
      )
      managed.isOnFallbackDisplay = false
      placeOnDisplay({
        browserWindow: managed.browserWindow,
        bounds: placeWindowBounds({
          placement: managed.record,
          display,
        }),
        isFullScreen: managed.record.isFullScreen,
      })
    })
  }

  /** Open a new window on a display. */
  const add = ({
    id,
    url,
    displayId,
    isFullScreen,
  }: {
    id: string
    url: string
    displayId: number
    isFullScreen: boolean
  }) => {
    const display =
      screen
        .getAllDisplays()
        .find((candidate) => candidate.id === displayId) ??
      screen.getPrimaryDisplay()
    const record: SavedWindow = {
      id,
      url,
      displayId: display.id,
      displayLabel: display.label,
      displayBounds: display.bounds,
      windowBounds: display.workArea,
      isFullScreen,
      zoomByView: {},
    }
    createPageWindow({
      record,
      bounds: display.workArea,
      isOnFallbackDisplay: false,
    })
    onRecordsChanged()
  }

  /** Forget a closed window, with its zoom, cookies, and storage. */
  const forget = (windowId: string) => {
    if (!managedWindows.delete(windowId)) {
      return
    }
    void session
      .fromPartition(`persist:castkit-window-${windowId}`)
      .clearData()
    onRecordsChanged()
  }

  /** Close a window and forget it. */
  const remove = (windowId: string) => {
    const managed = managedWindows.get(windowId)
    if (managed && !managed.browserWindow.isDestroyed()) {
      managed.browserWindow.destroy()
    }
    forget(windowId)
  }

  /** The page a view in a window reports, from its preload. */
  const reportView = ({
    webContents,
    view,
  }: {
    webContents: WebContents
    view: string | null
  }) => {
    const managed = findByWebContents(webContents)
    if (!managed) {
      return
    }
    managed.reportedView = view
    applyZoom(managed)
  }

  /** Keep every window on the same page after the server address changes. */
  const rebaseAll = (serverOrigin: string) => {
    managedWindows.forEach((managed) => {
      const url = rebaseUrl({
        url: managed.record.url,
        serverOrigin,
      })
      managed.record = { ...managed.record, url }
      if (!managed.browserWindow.isDestroyed()) {
        // `did-fail-load` logs a failure and schedules the retry.
        void managed.browserWindow
          .loadURL(url)
          .catch(() => undefined)
      }
    })
    onRecordsChanged()
  }

  const describeWindow = (managed: ManagedWindow) => {
    const title = managed.browserWindow.isDestroyed()
      ? ""
      : managed.browserWindow.getTitle()
    const path = (() => {
      try {
        return new URL(managed.record.url).pathname
      } catch {
        return managed.record.url
      }
    })()
    return title && title !== "CastKit"
      ? `${title} (${path})`
      : path
  }

  return {
    /** From here on, a closing window is kept for the next launch. */
    beginQuit: () => {
      lifecycle.isQuitting = true
    },
    add,
    remove,
    restore,
    returnWindowsToDisplays,
    reportView,
    rebaseAll,
    zoom,
    toggleFullScreen,
    reload,
    moveToDisplay,
    /** Every window's saved record, in the order they were opened. */
    readRecords: () =>
      [...managedWindows.values()].map(
        (managed) => managed.record,
      ),
    /** What the menus show for each window. */
    readMenuEntries: () =>
      [...managedWindows.values()].map((managed) => ({
        id: managed.record.id,
        label: describeWindow(managed),
        displayId: managed.record.displayId,
        isFullScreen: managed.record.isFullScreen,
      })),
    /** The window a menu shortcut acts on. */
    readFocusedWindowId: () =>
      [...managedWindows.values()].find(
        (managed) =>
          !managed.browserWindow.isDestroyed() &&
          managed.browserWindow.isFocused(),
      )?.record.id ?? null,
    readBrowserWindow: (windowId: string) =>
      managedWindows.get(windowId)?.browserWindow ?? null,
  }
}

/** The window manager's public surface. */
export type WindowManager = ReturnType<
  typeof createWindowManager
>
