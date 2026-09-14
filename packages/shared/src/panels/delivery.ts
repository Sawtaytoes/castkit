/**
 * Who draws the pixels. See `docs/display-properties.md`.
 *
 * ⚠️ `delivery` is not panel technology. The M5Paper is ePaper and the
 * WT32-SC01 is a color LCD, and both are fed finished frames — for different
 * reasons. It selects the renderer and the transport, and nothing else: it
 * does not say whether a panel is interactive, or fast, or color.
 */

export const DELIVERIES = [
  /** A kiosk browser loads `/d/<id>` and the SPA renders over one WebSocket. */
  "live-browser",
  /** CastKit renders a finished frame and pushes it to the panel. */
  "pushed-frames",
  /** CastKit publishes a render URL and the panel fetches the bytes itself. */
  "pulled-frames",
] as const

export type Delivery = (typeof DELIVERIES)[number]
