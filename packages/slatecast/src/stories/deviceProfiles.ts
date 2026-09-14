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
export const MEDIA_CONTROLS_PROFILE: BrowserDeviceProfile =
  {
    id: "media-controls",
    label: "Media Controls (square, touch)",
    width: 720,
    height: 720,
    shape: "square",
    hasTouch: true,
    colour: "full",
    externalViews: [],
  }

/** HyperPixel 2.1 Round. Not yet located; no case. */
export const PORTHOLE_PROFILE: BrowserDeviceProfile = {
  id: "porthole",
  label: "Porthole (round)",
  width: 480,
  height: 480,
  shape: "round",
  hasTouch: false,
  colour: "full",
  externalViews: [],
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
  shape: "rect",
  hasTouch: true,
  colour: "full",
  externalViews: [],
}

/**
 * Raspberry Pi Touch Display 2, the 7 inch panel on the SpoolBuddy console.
 * Its native panel is 720×1280 portrait and the kiosk can run it either way,
 * so both orientations are separate profiles — the layouts differ completely
 * and a landscape-only story would hide half of what ships.
 */
export const PI_TOUCH_LANDSCAPE_PROFILE: BrowserDeviceProfile =
  {
    id: "pi-touch-landscape",
    label: "Pi Touch 2 (1280x720 landscape, touch)",
    width: 1280,
    height: 720,
    shape: "rect",
    hasTouch: true,
    colour: "full",
    externalViews: [],
  }

export const PI_TOUCH_PORTRAIT_PROFILE: BrowserDeviceProfile =
  {
    id: "pi-touch-portrait",
    label: "Pi Touch 2 (720x1280 portrait, touch)",
    width: 720,
    height: 1280,
    shape: "rect",
    hasTouch: true,
    colour: "full",
    externalViews: [],
  }

export const BROWSER_DEVICE_PROFILES: readonly BrowserDeviceProfile[] =
  [
    MEDIA_CONTROLS_PROFILE,
    PORTHOLE_PROFILE,
    WORKBENCH_PROFILE,
    PI_TOUCH_LANDSCAPE_PROFILE,
    PI_TOUCH_PORTRAIT_PROFILE,
  ]
