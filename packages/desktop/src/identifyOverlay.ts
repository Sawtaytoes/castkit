import { BrowserWindow, screen } from "electron"
import {
  type NumberedDisplay,
  numberDisplays,
} from "./displayMatching.ts"
import { buildIdentifyOverlayHtml } from "./identifyOverlayHtml.ts"

const overlayDuration = 3000

const openOverlays = new Set<BrowserWindow>()

const closeTimer: {
  handle?: ReturnType<typeof setTimeout>
} = {}

const closeOverlays = () => {
  clearTimeout(closeTimer.handle)
  openOverlays.forEach((overlay) => {
    if (!overlay.isDestroyed()) {
      overlay.destroy()
    }
  })
  openOverlays.clear()
}

/** One click-through overlay over a whole monitor, shown without focus. */
const openOverlay = (display: NumberedDisplay) => {
  const { x, y, width, height } = display.bounds
  const overlay = new BrowserWindow({
    x,
    y,
    width,
    height,
    alwaysOnTop: true,
    enableLargerThanScreen: true,
    focusable: false,
    frame: false,
    hasShadow: false,
    // Resizable so the second `setBounds` below is honored on Windows.
    resizable: true,
    show: false,
    skipTaskbar: true,
    transparent: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      javascript: false,
    },
  })
  overlay.setIgnoreMouseEvents(true)
  overlay.once("ready-to-show", () => {
    // Mixed-DPI fix: constructor bounds land in the wrong DIP space when the
    // target monitor's scale factor differs from the primary's. Setting
    // them again once the window exists on that monitor fits it exactly.
    overlay.setBounds({ x, y, width, height })
    overlay.showInactive()
  })
  void overlay.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(
      buildIdentifyOverlayHtml({
        number: display.number,
        label: display.label,
        width,
        height,
      }),
    )}`,
  )
  return overlay
}

const highlighted: {
  overlay: BrowserWindow | null
  displayId: number | null
} = { overlay: null, displayId: null }

/** Take the hover highlight off its monitor. */
export const clearDisplayHighlight = () => {
  if (
    highlighted.overlay &&
    !highlighted.overlay.isDestroyed()
  ) {
    highlighted.overlay.destroy()
  }
  highlighted.overlay = null
  highlighted.displayId = null
}

/**
 * Frame one monitor while the pointer is over its name in the settings
 * window, the way Image-Viewer frames a display in its spawn menu. It stays
 * until the pointer leaves, and it never takes focus from the settings.
 */
export const highlightDisplay = (displayId: number) => {
  if (
    highlighted.displayId === displayId &&
    highlighted.overlay &&
    !highlighted.overlay.isDestroyed()
  ) {
    return
  }
  clearDisplayHighlight()
  const display = readNumberedDisplays().find(
    (candidate) => candidate.id === displayId,
  )
  if (!display) {
    return
  }
  highlighted.overlay = openOverlay(display)
  highlighted.displayId = displayId
}

/** The numbered displays as the menus list them. */
export const readNumberedDisplays = () =>
  numberDisplays({
    displays: screen.getAllDisplays(),
    primaryDisplayId: screen.getPrimaryDisplay().id,
  })

/**
 * Show a big number on every monitor for a few seconds, the same numbers the
 * "Move to display" menu uses. Each overlay is click-through, cannot take
 * focus, and closes by itself.
 */
export const identifyDisplays = () => {
  closeOverlays()
  readNumberedDisplays().forEach((display) => {
    openOverlays.add(openOverlay(display))
  })
  closeTimer.handle = setTimeout(
    closeOverlays,
    overlayDuration,
  )
}
