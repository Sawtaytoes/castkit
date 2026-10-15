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
  /** `null` while the window is closed: it is kept, and opens again on request. */
  browserWindow: BrowserWindow | null
  reportedView: string | null
  /** True while the window sits on the primary display because its own monitor is missing. */
  isOnFallbackDisplay: boolean
  /** True during programmatic placement, so intermediate events are not saved. */
  isPlacing: boolean
  /** The last view and factor logged, so a repeated report is not logged again. */
  appliedZoom: string
  placementGeneration: number
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
  onWindowMenu,
  attachSignIn,
  detachSignIn,
  log,
}: {
  readServerOrigin: () => string | null
  preloadPath: string
  iconPath: string
  /** Called after any change a restart must remember, and after any change the menus show. */
  onRecordsChanged: () => void
  /**
   * Open the window's own menu: a right click with the mouse puts it at the
   * pointer, and Alt in fullscreen, where no menu bar shows, at the corner.
   */
  onWindowMenu: (request: {
    windowId: string
    isAtCorner: boolean
  }) => void
  /** Share the server sign-in with a window's partition before its page loads. */
  attachSignIn: (partition: string) => Promise<void>
  detachSignIn: (partition: string) => void
  log: (message: string) => void
}) => {
  const managedWindows = new Map<string, ManagedWindow>()
  const lifecycle = { isQuitting: false }

  /** The window's live `BrowserWindow`, or `null` while it is closed. */
  const liveWindow = (
    managed: ManagedWindow | undefined,
  ) =>
    managed?.browserWindow &&
    !managed.browserWindow.isDestroyed()
      ? managed.browserWindow
      : null

  const partitionOf = (windowId: string) =>
    `persist:castkit-window-${windowId}`

  const findByWebContents = (webContents: WebContents) =>
    [...managedWindows.values()].find(
      (managed) =>
        liveWindow(managed)?.webContents.id ===
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
    const browserWindow = liveWindow(managed)
    if (!browserWindow) {
      return
    }
    const viewKey = resolveViewKey({
      reportedView: managed.reportedView,
      url: browserWindow.webContents.getURL(),
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
    browserWindow.webContents.setZoomFactor(factor)
  }

  const zoom = ({
    windowId,
    request,
  }: {
    windowId: string
    request: ZoomRequest
  }) => {
    const managed = managedWindows.get(windowId)
    const browserWindow = liveWindow(managed)
    if (!managed || !browserWindow) {
      return
    }
    const { webContents } = browserWindow
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
    const browserWindow = liveWindow(
      managedWindows.get(windowId),
    )
    if (browserWindow) {
      const isFullScreen = !browserWindow.isFullScreen()
      // A deliberate request also applies while the saved monitor is absent;
      // the OS moving a window off a disconnected monitor must not change it.
      updateRecord({ windowId, change: { isFullScreen } })
      browserWindow.setFullScreen(isFullScreen)
    }
  }

  const reload = (windowId: string) => {
    liveWindow(
      managedWindows.get(windowId),
    )?.webContents.reload()
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
    managed,
    bounds,
    isFullScreen,
    onPlaced,
  }: {
    managed: ManagedWindow
    bounds: Rectangle
    isFullScreen: boolean
    onPlaced?: () => void
  }) => {
    const browserWindow = liveWindow(managed)
    if (!browserWindow) {
      return
    }
    managed.isPlacing = true
    const generation = managed.placementGeneration + 1
    managed.placementGeneration = generation
    if (browserWindow.isFullScreen()) {
      browserWindow.setFullScreen(false)
    }
    browserWindow.setBounds(bounds)
    setTimeout(() => {
      if (
        browserWindow.isDestroyed() ||
        managed.placementGeneration !== generation
      ) {
        return
      }
      browserWindow.setBounds(bounds)
      if (isFullScreen) {
        browserWindow.setFullScreen(true)
      }
      managed.isPlacing = false
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
    const browserWindow = liveWindow(managed)
    const display = screen
      .getAllDisplays()
      .find((candidate) => candidate.id === displayId)
    if (!managed || !browserWindow || !display) {
      return
    }
    const isFullScreen = browserWindow.isFullScreen()
    managed.isOnFallbackDisplay = false
    placeOnDisplay({
      managed,
      bounds: display.workArea,
      isFullScreen,
      onPlaced: () => {
        if (browserWindow.isDestroyed()) {
          return
        }
        updateRecord({
          windowId,
          change: {
            ...capturePlacement(browserWindow),
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
    const partition = partitionOf(record.id)
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
      record: { ...record, isClosed: false },
      browserWindow,
      reportedView: null,
      isOnFallbackDisplay,
      isPlacing: true,
      appliedZoom: "",
      placementGeneration: 0,
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
        managed,
        bounds,
        isFullScreen: record.isFullScreen,
        onPlaced: () => {
          if (!managed.isOnFallbackDisplay) {
            updateRecord({
              windowId: record.id,
              change: capturePlacement(browserWindow),
            })
          }
        },
      })
    }
    browserWindow.once("ready-to-show", finishPlacing)
    // A server that is down at login never paints a first frame, so the
    // window would stay hidden; show it anyway after a short wait.
    setTimeout(finishPlacing, showDeadline)

    const isWaitingForDisplay = () => {
      if (
        matchDisplay({
          displays: screen.getAllDisplays(),
          placement: managed.record,
          primaryDisplayId: screen.getPrimaryDisplay().id,
        }).matchedBy === "primary-fallback"
      ) {
        managed.isOnFallbackDisplay = true
      }
      return managed.isOnFallbackDisplay
    }
    const savePlacement = () => {
      if (
        managed.isPlacing ||
        isWaitingForDisplay() ||
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
      if (!managed.isPlacing && !isWaitingForDisplay()) {
        updateRecord({
          windowId: record.id,
          change: { isFullScreen: true },
        })
      }
    })
    browserWindow.on("leave-full-screen", () => {
      if (!managed.isPlacing && !isWaitingForDisplay()) {
        updateRecord({
          windowId: record.id,
          change: { isFullScreen: false },
        })
      }
    })

    // Alt pressed and released alone opens the window menu in fullscreen,
    // where the menu bar that Alt shows in a window does not exist.
    const altPress = { isAlone: false }
    webContents.on("before-input-event", (event, input) => {
      if (input.key === "Alt") {
        if (
          input.type === "keyDown" &&
          !input.isAutoRepeat
        ) {
          altPress.isAlone =
            !input.control && !input.shift && !input.meta
        } else if (
          input.type === "keyUp" &&
          altPress.isAlone &&
          browserWindow.isFullScreen()
        ) {
          altPress.isAlone = false
          onWindowMenu({
            windowId: record.id,
            isAtCorner: true,
          })
        }
        return
      }
      if (input.type === "keyDown") {
        altPress.isAlone = false
      }
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
        onWindowMenu({
          windowId: record.id,
          isAtCorner: params.menuSourceType === "keyboard",
        })
      }
    })
    const rememberUrl = (url: string) => {
      const serverOrigin = readServerOrigin()
      if (
        serverOrigin &&
        isAllowedNavigation({ url, serverOrigin })
      ) {
        updateRecord({
          windowId: record.id,
          change: { url },
        })
      }
    }
    webContents.on("did-navigate", (_event, url) => {
      rememberUrl(url)
      managed.reportedView = null
      applyZoom(managed)
    })
    webContents.on(
      "did-navigate-in-page",
      (_event, url, isMainFrame) => {
        if (isMainFrame) {
          rememberUrl(url)
        }
      },
    )
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
          if (
            !browserWindow.isDestroyed() &&
            managed.browserWindow === browserWindow
          ) {
            void browserWindow
              .loadURL(managed.record.url)
              .catch(() => undefined)
          }
        }, reloadDelay)
      },
    )
    browserWindow.on(
      "page-title-updated",
      (_event, title) => {
        updateRecord({
          windowId: record.id,
          change: {
            title:
              title === "CastKit"
                ? ""
                : title.slice(0, 200),
          },
        })
      },
    )
    browserWindow.on("closed", () => {
      // Quitting closes every window, and those windows must open again at
      // the next launch. "Remove window" has already forgotten its window.
      // Any other close is the X button: the window is kept, closed.
      const current = managedWindows.get(record.id)
      if (
        lifecycle.isQuitting ||
        current?.browserWindow !== browserWindow
      ) {
        return
      }
      current.browserWindow = null
      current.reportedView = null
      current.appliedZoom = ""
      updateRecord({
        windowId: record.id,
        change: { isClosed: true },
      })
    })

    // The page loads once the window's partition has the shared sign-in, so
    // a new window does not ask for a PIN another window already took.
    // `did-fail-load` above logs a failure and schedules the retry.
    void attachSignIn(partition)
      .catch(() => undefined)
      .then(() => {
        if (!browserWindow.isDestroyed()) {
          return browserWindow.loadURL(managed.record.url)
        }
        return undefined
      })
      .catch(() => undefined)
    return managed
  }

  /** Open a saved window where it was, on the monitor it was on. */
  const restore = (record: SavedWindow) => {
    if (record.isClosed) {
      managedWindows.set(record.id, {
        record,
        browserWindow: null,
        reportedView: null,
        isOnFallbackDisplay: false,
        isPlacing: false,
        appliedZoom: "",
        placementGeneration: 0,
      })
      return
    }
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

  /** Preserve a missing monitor's placement and return windows when it reconnects. */
  const returnWindowsToDisplays = () => {
    const displays = screen.getAllDisplays()
    const primaryDisplayId = screen.getPrimaryDisplay().id
    managedWindows.forEach((managed) => {
      const browserWindow = liveWindow(managed)
      if (!browserWindow) {
        return
      }
      const { display, matchedBy } = matchDisplay({
        displays,
        placement: managed.record,
        primaryDisplayId,
      })
      if (matchedBy === "primary-fallback") {
        managed.isOnFallbackDisplay = true
        managed.placementGeneration += 1
        return
      }
      if (!managed.isOnFallbackDisplay) {
        return
      }
      log(
        `Window ${managed.record.id}: display "${managed.record.displayLabel}" is back; returning the window to it.`,
      )
      managed.isOnFallbackDisplay = false
      placeOnDisplay({
        managed,
        bounds: placeWindowBounds({
          placement: managed.record,
          display,
        }),
        isFullScreen: managed.record.isFullScreen,
        onPlaced: () => {
          updateRecord({
            windowId: managed.record.id,
            change: capturePlacement(browserWindow),
          })
        },
      })
    })
  }

  /** Bring a window forward, or open a closed one again where it was. */
  const open = (windowId: string) => {
    const managed = managedWindows.get(windowId)
    if (!managed) {
      return
    }
    const browserWindow = liveWindow(managed)
    if (browserWindow) {
      if (browserWindow.isMinimized()) {
        browserWindow.restore()
      }
      browserWindow.show()
      browserWindow.focus()
      return
    }
    restore({ ...managed.record, isClosed: false })
    onRecordsChanged()
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
      isClosed: false,
      title: "",
    }
    createPageWindow({
      record,
      bounds: display.workArea,
      isOnFallbackDisplay: false,
    })
    onRecordsChanged()
  }

  /** Close a window if it is open, and forget it with its zoom, cookies, and storage. */
  const remove = (windowId: string) => {
    const managed = managedWindows.get(windowId)
    if (!managed) {
      return
    }
    // Forgotten first, so the `closed` handler does not keep it as closed.
    managedWindows.delete(windowId)
    liveWindow(managed)?.destroy()
    detachSignIn(partitionOf(windowId))
    void session
      .fromPartition(partitionOf(windowId))
      .clearData()
    onRecordsChanged()
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
      // `did-fail-load` logs a failure and schedules the retry.
      void liveWindow(managed)
        ?.loadURL(url)
        .catch(() => undefined)
    })
    onRecordsChanged()
  }

  const readPath = (managed: ManagedWindow) => {
    try {
      return new URL(managed.record.url).pathname
    } catch {
      return managed.record.url
    }
  }

  const describeWindow = (managed: ManagedWindow) => {
    const path = readPath(managed)
    return managed.record.title
      ? `${managed.record.title} (${path})`
      : path
  }

  return {
    /** From here on, a closing window is kept for the next launch. */
    beginQuit: () => {
      lifecycle.isQuitting = true
    },
    add,
    open,
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
        title: managed.record.title,
        path: readPath(managed),
        displayId: managed.record.displayId,
        isFullScreen: managed.record.isFullScreen,
        isOpen: liveWindow(managed) !== null,
      })),
    /** The window a menu shortcut acts on. */
    readFocusedWindowId: () =>
      [...managedWindows.values()].find((managed) =>
        liveWindow(managed)?.isFocused(),
      )?.record.id ?? null,
    readBrowserWindow: (windowId: string) =>
      liveWindow(managedWindows.get(windowId)),
  }
}

/** The window manager's public surface. */
export type WindowManager = ReturnType<
  typeof createWindowManager
>
