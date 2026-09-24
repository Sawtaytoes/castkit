import type { BrowserDeviceProfile } from "@castkit/shared/protocol/ws"

/**
 * Every browser-mode panel the household runs, plus the two the example config
 * ships. Slatecast is sized in viewport units, so a story is only faithful when
 * the document it renders in is the panel's own size — these feed the per-view
 * stories' panel frames, the all-screens matrix, and the Storybook viewport
 * list.
 *
 * Keep this list in step with `home-displays/AGENTS.md`. A panel missing here
 * is a panel nobody can review before it ships to the wall.
 */

/** HyperPixel 4.0 Square on a Pi 4 — Basement 3D Printers Workbench Display. */
/**
 * The Axis A facts every directly-driven kiosk panel shares: an LCD composited
 * by the browser on the panel itself. `instant`, no controller between the
 * frame and the glass, and a stripe the renderer can use.
 */
const LIVE_LCD_PANEL = {
  delivery: "live-browser",
  repaint: "instant",
  hasPanelDithering: false,
  pixelGrid: "rgb-stripe",
} as const

const TOUCH_VIEWS = [
  { name: "Now Playing", clientId: "now-playing" },
  { name: "Clock", clientId: "clock" },
  { name: "Touch Test", clientId: "touch-test" },
] as const

const TOUCHLESS_VIEWS = [
  { name: "Now Playing", clientId: "now-playing" },
  { name: "Clock", clientId: "clock" },
] as const

export const MEDIA_CONTROLS_PROFILE: BrowserDeviceProfile =
  {
    id: "media-controls",
    label: "Media Controls (square, touch)",
    width: 720,
    height: 720,
    shape: "square",
    hasTouch: true,
    hasViewDrawer: true,
    color: "full",
    ...LIVE_LCD_PANEL,
    externalViews: [],
    views: TOUCH_VIEWS,
  }

/** HyperPixel 2.1 Round. Not yet located; no case. */
export const PORTHOLE_PROFILE: BrowserDeviceProfile = {
  id: "porthole",
  label: "Porthole (round)",
  width: 480,
  height: 480,
  shape: "round",
  hasTouch: false,
  hasViewDrawer: false,
  color: "full",
  ...LIVE_LCD_PANEL,
  externalViews: [],
  views: TOUCHLESS_VIEWS,
}

/**
 * The 480×320 WT32 workbench panel: a short landscape touch screen driven by
 * the remote-display renderer. It is the only profile that matches the
 * `.now-playing` short-landscape layout, so it is the story that shows it.
 */
export const WORKBENCH_PROFILE: BrowserDeviceProfile = {
  id: "workbench",
  label: "Workbench (480x320 landscape, touch)",
  width: 480,
  height: 320,
  shape: "rectangle",
  hasTouch: true,
  hasViewDrawer: false,
  color: "full",
  /*
   * The one profile here that is NOT a directly-driven kiosk. The WT32-SC01 is
   * `delivery: pushed-frames`: a browser on the worker host composites the
   * frame and the panel is a remote framebuffer, so it repaints in about a
   * second rather than instantly, and it may not animate. That also makes it
   * the only story that exercises the non-`instant` branch of the panel stamp.
   *
   * `pixelGrid: "none"` even though the glass is an LCD, because the frame
   * arrives as a bitmap. Headless Chromium antialiases in gray and will not do
   * otherwise, so there is no stripe for anything to line up with.
   */
  delivery: "pushed-frames",
  repaint: "fast",
  hasPanelDithering: false,
  pixelGrid: "none",
  externalViews: [],
  views: TOUCH_VIEWS,
}

/**
 * Raspberry Pi Touch Display 2, the 7 inch panel on the SpoolBuddy console.
 * Its native panel is 720×1280 portrait and the kiosk can run it either way,
 * so both orientations are separate profiles — the layouts differ completely
 * and a landscape-only story would hide half of what ships.
 *
 * The landscape one is the Basement 3D Printers Workbench Display, and its
 * view drawer is OFF: that panel navigates by the undrawn hand-back edge now.
 * A story that still drew the drawer handles would show two edge affordances
 * the wall panel does not have. See
 * docs/decisions/2026-09-23-an-edge-hands-the-panel-back-and-draws-nothing.md.
 */
export const PI_TOUCH_LANDSCAPE_PROFILE: BrowserDeviceProfile =
  {
    id: "pi-touch-landscape",
    label: "Pi Touch 2 (1280x720 landscape, touch)",
    width: 1280,
    height: 720,
    shape: "rectangle",
    hasTouch: true,
    hasViewDrawer: false,
    color: "full",
    ...LIVE_LCD_PANEL,
    externalViews: [
      {
        name: "SpoolBuddy",
        url: "https://example.com/spoolbuddy",
      },
    ],
    views: [
      {
        name: "Printer Status",
        clientId: "printer-status",
      },
      ...TOUCH_VIEWS,
      { name: "SpoolBuddy", clientId: "external-view:0" },
    ],
  }

export const PI_TOUCH_PORTRAIT_PROFILE: BrowserDeviceProfile =
  {
    id: "pi-touch-portrait",
    label: "Pi Touch 2 (720x1280 portrait, touch)",
    width: 720,
    height: 1280,
    shape: "rectangle",
    hasTouch: true,
    hasViewDrawer: true,
    color: "full",
    ...LIVE_LCD_PANEL,
    externalViews: [],
    views: TOUCH_VIEWS,
  }

export const BROWSER_DEVICE_PROFILES: readonly BrowserDeviceProfile[] =
  [
    MEDIA_CONTROLS_PROFILE,
    PORTHOLE_PROFILE,
    WORKBENCH_PROFILE,
    PI_TOUCH_LANDSCAPE_PROFILE,
    PI_TOUCH_PORTRAIT_PROFILE,
  ]
