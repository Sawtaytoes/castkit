import type { Delivery } from "../panels/delivery.ts"
import type { PixelGrid } from "../panels/pixelGrid.ts"
import type { RepaintGrade } from "../panels/repaint.ts"
import type {
  AgendaData,
  NowPlayingData,
  QueueData,
  WeatherData,
} from "../viewData/types.ts"
import type { DeviceCommand } from "./commands.ts"

/**
 * The server↔browser WebSocket protocol for browser-mode (Slatecast) devices.
 * One socket per device page at `/d/<id>/ws`: the server sends a full
 * `snapshot` on connect, then deltas; the client sends `command` for taps.
 * A `view` message swaps the active view without a page reload.
 */

/**
 * Default Photo Frame rotation interval (minutes) when Home Assistant hasn't
 * set one. Shared by the server settings defaults and the client fallback so
 * both agree before the first retained value arrives.
 */
export const DEFAULT_PHOTO_INTERVAL_MINUTES = 10

/**
 * Resolved global clock settings the browser views format against, so browser
 * displays honor the same Home Assistant Clock:* knobs as the ePaper devices
 * (timezone via `Intl`, 12/24-hour, long/numeric date). The server stamps this
 * onto every settings payload; `timeZone` absent = the device's local zone.
 */
export type BrowserClockConfig = {
  /** IANA timezone (e.g. "America/Chicago"); absent = device-local. */
  timeZone?: string
  isTwelveHour: boolean
  isNumericDate: boolean
}

/** Dynamic per-device settings the browser applies live (no reload). */
export type BrowserDeviceSettings = {
  /** Clockwise degrees the client applies as a CSS transform. */
  orientation: 0 | 90 | 180 | 270
  theme: "Auto" | "Dark" | "Light"
  /** Photo Frame rotation interval, minutes — the SPA rotates client-side. */
  photoIntervalMinutes: number
  /**
   * Server-stamped global clock config. Optional on the wire so an older
   * payload stays valid; the client falls back to a device-local default.
   */
  clock?: BrowserClockConfig
}

/** Static capabilities inlined into the page shell and the snapshot. */
export type BrowserDeviceProfile = {
  id: string
  label: string
  width: number
  height: number
  shape: "square" | "round" | "rectangle"
  hasTouch: boolean
  color: "monochrome" | "grayscale" | "spectra6" | "full"
  /**
   * How long this glass takes to show a new frame. A live-browser panel is
   * `instant` unless its config says otherwise, and only `instant` may animate
   * — below that an animation is a stutter, and below `fast` it is a flicker.
   */
  repaint: RepaintGrade
  /**
   * Whether the panel's own controller dithers. `false` means what CastKit
   * emits is exactly what the glass shows.
   */
  hasPanelDithering: boolean
  /**
   * The subpixel stripe. `none` means subpixel antialiasing would be colored
   * noise and text must be antialiased in gray.
   */
  pixelGrid: PixelGrid
  /**
   * Who draws the pixels. Always `live-browser` from this server — a panel
   * that is fed frames never opens this socket. It is on the profile anyway so
   * a Storybook story can stamp a frame-fed panel from the same record, which
   * is the only way a story cannot disagree with the panel.
   */
  delivery: Delivery
  /**
   * @deprecated Legacy aliases of `shape` and `color`, kept so a kiosk still
   * running the pre-2026-09-14 bundle keeps working across a deploy.
   *
   * A panel holds its page until something reloads it, so the server can ship a
   * renamed field hours before the client that reads it does. An old bundle
   * reads `device.colour` and gets `undefined`, which is not a crash — it is a
   * panel that silently renders in the wrong color mode.
   *
   * Remove both once every panel has reloaded. Nothing in this repo reads them.
   */
  colour?: "mono" | "greyscale" | "e6" | "full"
  /** @deprecated See `colour`. */
  legacyShape?: "square" | "round" | "rect"
  externalViews: readonly {
    name: string
    url: string
  }[]
  /** Every view this panel may request from its on-screen view switcher. */
  views: readonly {
    name: string
    clientId: string
  }[]
}

export type ViewDataState = {
  nowPlaying?: NowPlayingData
  queue?: QueueData
  weather?: WeatherData
  agenda?: AgendaData
}

export type ServerToClientMessage =
  | {
      type: "snapshot"
      device: BrowserDeviceProfile
      settings: BrowserDeviceSettings
      /** The active view's client id (see the view registry). */
      view: string
      data: ViewDataState
    }
  | { type: "view"; view: string }
  | { type: "now_playing"; data: NowPlayingData }
  | { type: "queue"; data: QueueData }
  | { type: "weather"; data: WeatherData }
  | { type: "agenda"; data: AgendaData }
  | { type: "settings"; settings: BrowserDeviceSettings }
  | { type: "reload" }

export type ClientToServerMessage = {
  type: "command"
  command: DeviceCommand
}
