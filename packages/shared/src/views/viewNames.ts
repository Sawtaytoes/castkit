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
  "Photo Frame (Agenda)",
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
 * The photo-frame view family. The three full-photo variants differ in how the
 * adapter builds their server-composed PNG: plain letterboxes when faces do not
 * fit, Fill keeps the primary face, and Duo pairs two portraits. Photo Frame
 * (Agenda) composes one portrait-shaped photo for the left half of its split.
 * See the photo adapter and the view decisions under docs/decisions/.
 */
export const PHOTO_VIEW_NAMES: ReadonlySet<ViewName> =
  new Set([
    "Photo Frame",
    "Photo Frame (Fill)",
    "Photo Frame (Duo)",
    "Photo Frame (Agenda)",
  ])

export const getIsPhotoView = (viewName: ViewName) =>
  PHOTO_VIEW_NAMES.has(viewName)

/**
 * Full-photo views may ship a lossy full-color frame when the device asks for
 * one. The photo-agenda split stays lossless because it also carries text and
 * exact palette colors. (There is no "bleed" view any more — every view,
 * photo included, is laid out inside the box the mat leaves visible. See
 * docs/decisions/2026-09-08-photo-views-fit-the-visible-window.md.)
 */
const LOSSY_PHOTO_VIEW_NAMES: ReadonlySet<ViewName> =
  new Set([
    "Photo Frame",
    "Photo Frame (Fill)",
    "Photo Frame (Duo)",
  ])

export const getIsLossyEncodableView = (
  viewName: ViewName,
) => LOSSY_PHOTO_VIEW_NAMES.has(viewName)
