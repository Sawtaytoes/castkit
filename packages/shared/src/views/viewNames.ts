/**
 * The view vocabulary — the names a device can be told to show.
 *
 * These live in shared rather than the server because they are a contract, not
 * an implementation: they appear verbatim in Home Assistant's View select,
 * double as the API/MQTT payload values, and the browser preview needs the same
 * list to guarantee it covers every view the server can render. The server's
 * `views/registry.ts` owns how a name becomes a React element; this owns only
 * what the names are.
 */

export const VIEW_NAMES = [
  "Now Playing (Dashboard)",
  "Now Playing (Poster)",
  "Photo Frame",
  "Photo Frame (Fill)",
  "Photo Frame (Duo)",
  "Clock",
  "Clock (Weather)",
  "Clock (Agenda)",
  "Agenda",
] as const

export type ViewName = (typeof VIEW_NAMES)[number]

export const getIsViewName = (
  value: string,
): value is ViewName =>
  (VIEW_NAMES as readonly string[]).includes(value)

/**
 * The photo-frame view family. All paint a server-composed PNG (so they render
 * identically here); they differ only in how the photo adapter builds that PNG
 * for the device — "Photo Frame" letterboxes when faces don't fit, "(Fill)"
 * fills the panel keeping the primary face, "(Duo)" pairs two portraits side by
 * side on a landscape panel. See the photo adapter + docs/decisions/
 * 2026-07-12-dual-portrait-photo-layout.md.
 */
export const PHOTO_VIEW_NAMES: ReadonlySet<ViewName> =
  new Set([
    "Photo Frame",
    "Photo Frame (Fill)",
    "Photo Frame (Duo)",
  ])

export const getIsPhotoView = (viewName: ViewName) =>
  PHOTO_VIEW_NAMES.has(viewName)

/**
 * Views that should bleed to the panel edge (ignoring the safe-area crop
 * inset). Photos look right filling the whole panel even under a mat; text
 * must stay inside the visible window. Every photo-frame view bleeds.
 */
export const getIsBleedView = (viewName: ViewName) =>
  getIsPhotoView(viewName)
