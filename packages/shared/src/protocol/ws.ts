import type { Delivery } from "../panels/delivery.ts"
import type { PixelGrid } from "../panels/pixelGrid.ts"
import type { RepaintGrade } from "../panels/repaint.ts"
import type {
  AgendaData,
  NowPlayingData,
  PrintersData,
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
  /**
   * Whether something has taken this panel over: a view a person asked for, or
   * an app holding the glass (SpoolBuddy while a spool is on the load cell).
   *
   * RUNTIME, not configuration. Home Assistant publishes it NON-retained and
   * the server keeps it in memory only, so a restart clears it. A retained
   * `true` would leave a live edge region on a panel with nothing to hand back.
   *
   * The panel's hand-back edge exists only while this is true. See
   * docs/decisions/2026-09-23-an-edge-hands-the-panel-back-and-draws-nothing.md.
   */
  isViewHeld?: boolean
}

/**
 * A deployment-configured application the panel frames as a view.
 *
 * The server probes the view's configured health URL and sends only the
 * answer: the URL itself stays on the server.
 */
export type BrowserExternalView = {
  name: string
  url: string
  /** Page zoom applied to the frame; absent means 1. */
  zoom?: number
  /**
   * Whether the application's health URL last answered 2xx. Present only for
   * a view that has a health URL; absent means "always show the frame", which
   * is also what a pre-2026-09-26 bundle does with a snapshot that carries it.
   */
  isAvailable?: boolean
}

/** Static capabilities inlined into the page shell and the snapshot. */
export type BrowserDeviceProfile = {
  id: string
  label: string
  width: number
  height: number
  shape: "square" | "round" | "rectangle"
  hasTouch: boolean
  /** Whether this installation exposes the panel-local edge view drawer. */
  hasViewDrawer: boolean
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
   * A panel now reloads itself when `buildId` changes, so "once every panel has
   * reloaded" is one deploy after 2026-09-23 rather than an open wait on a
   * person — see the new-build-reloads-a-live-browser-panel record.
   */
  colour?: "mono" | "greyscale" | "e6" | "full"
  /** @deprecated See `colour`. */
  legacyShape?: "square" | "round" | "rect"
  externalViews: readonly BrowserExternalView[]
  /** Every view this panel is configured to offer. */
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
  printers?: PrintersData
}

export type ServerToClientMessage =
  | {
      type: "snapshot"
      device: BrowserDeviceProfile
      settings: BrowserDeviceSettings
      /** The active view's client id (see the view registry). */
      view: string
      data: ViewDataState
      /**
       * A content hash of the SPA bundle the server is serving right now.
       *
       * A panel compares this against the id baked into the page it loaded.
       * They differ only when the server has been deployed since — the panel
       * is running an older bundle — and the panel reloads itself.
       *
       * Optional because a panel still on a pre-2026-09-23 bundle receives
       * snapshots that never carried it, and a missing id must mean "cannot
       * tell", never "reload".
       */
      buildId?: string
    }
  | { type: "view"; view: string }
  | { type: "now_playing"; data: NowPlayingData }
  | { type: "queue"; data: QueueData }
  | { type: "weather"; data: WeatherData }
  | { type: "agenda"; data: AgendaData }
  | { type: "printers"; data: PrintersData }
  | { type: "settings"; settings: BrowserDeviceSettings }
  /**
   * The device's external views again, sent when one's availability changes.
   * The whole list replaces the profile's, so the client keeps the index each
   * `external-view:<n>` view id points at. An older bundle ignores the type.
   */
  | {
      type: "external_views"
      externalViews: readonly BrowserExternalView[]
    }
  | { type: "reload" }

export type ClientToServerMessage = {
  type: "command"
  command: DeviceCommand
}
