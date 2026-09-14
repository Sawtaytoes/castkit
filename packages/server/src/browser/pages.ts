import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { getIsGrayscaleTextRequired } from "@castkit/shared/panels/pixelGrid"
import type {
  BrowserDeviceSettings,
  ServerToClientMessage,
} from "@castkit/shared/protocol/ws"

/**
 * The `/d/<id>` page shell a kiosk browser loads. First paint is this static
 * HTML with the device's current state snapshot inlined as JSON — no SSR or
 * hydration machinery; the SPA reads `#castkit-state`, renders immediately,
 * then opens the WebSocket for live data. See the Preact-thin-client decision
 * record.
 */

/**
 * Where the Slatecast SPA build lives. In the Docker bundle it's copied next
 * to the server bundle (`dist/slatecast`); in dev it's the workspace build.
 */
export const resolveSlatecastDistDir = ():
  | string
  | null => {
  const candidates = [
    process.env.SLATECAST_DIST_DIR,
    resolve(import.meta.dirname, "./slatecast"),
    resolve(import.meta.dirname, "../../../slatecast/dist"),
  ].filter((path): path is string => Boolean(path))

  return candidates.find((path) => existsSync(path)) ?? null
}

const escapeJsonForHtml = (json: string) =>
  // `</script>` (and any `<`) inside inline JSON must not close the tag.
  json.replace(/</g, "\\u003c")

/**
 * The device's explicit theme becomes a token scheme. "Auto" is resolved in
 * the page before styles load, so it follows the display system setting from
 * its first paint.
 */
const resolveExplicitScheme = (
  theme: BrowserDeviceSettings["theme"],
) =>
  theme === "Light"
    ? "light"
    : theme === "Dark"
      ? "dark"
      : null

export const buildDevicePageHtml = ({
  snapshot,
}: {
  snapshot: Extract<
    ServerToClientMessage,
    { type: "snapshot" }
  >
}) => {
  const { device } = snapshot
  const scheme = resolveExplicitScheme(
    snapshot.settings.theme,
  )
  /*
   * The Axis A panel facts, stamped on the root element so a CSS rule can
   * read them before the bundle runs. The client re-stamps the same
   * attributes from the live profile, so a reconnect that changes one takes
   * effect without a reload — see `App.tsx`.
   *
   * `data-grayscale-text` is derived rather than raw, because whether
   * subpixel antialiasing is safe depends on BOTH the stripe and how the unit
   * is hung, and a stylesheet cannot do that arithmetic.
   */
  const panelStamp = [
    `data-repaint="${device.repaint}"`,
    `data-panel-dithering="${device.hasPanelDithering}"`,
    `data-pixel-grid="${device.pixelGrid}"`,
    `data-delivery="${device.delivery}"`,
    /*
     * `pointer` exists in the model and nothing in the fleet is there, so the
     * profile carries the boolean and the stamp names the two values that can
     * actually occur. A `pointer` panel gets its own field the day one is
     * registered.
     */
    `data-input="${device.hasTouch ? "touch" : "none"}"`,
    `data-grayscale-text="${getIsGrayscaleTextRequired({
      orientation: snapshot.settings.orientation,
      pixelGrid: device.pixelGrid,
    })}"`,
  ].join(" ")
  /*
   * The layout box as custom properties, so a view can size against the PANEL
   * rather than the viewport.
   *
   * `vw`, `vh` and `vmin` are right for an unrotated live-browser panel and
   * wrong the moment one is hung sideways: the stage is turned with a CSS
   * transform, so its box is `100vh` wide while a child's `vw` still resolves
   * against the untransformed viewport. Nothing reads these yet — the existing
   * views are all viewport-sized and correct today — but a view that needs the
   * real box no longer has to invent a way to find it.
   */
  const panelSizeStyle = [
    `--panel-width: ${device.width}px`,
    `--panel-height: ${device.height}px`,
    `--panel-min: ${Math.min(device.width, device.height)}px`,
  ].join("; ")
  const schemeAttribute = scheme
    ? ` data-scheme="${scheme}"`
    : ""
  const autoSchemeScript = scheme
    ? ""
    : `<script>document.documentElement.dataset.scheme=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"</script>`
  return `<!doctype html>
<html lang="en" data-shape="${device.shape}" data-touch="${device.hasTouch}" data-color="${device.color}" ${panelStamp}${schemeAttribute} data-density="kiosk" style="${panelSizeStyle}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no" />
<meta name="color-scheme" content="dark light" />
<title>${device.label} · CastKit</title>
${autoSchemeScript}
<link rel="stylesheet" href="/assets/slatecast.css" />
</head>
<body>
<script type="application/json" id="castkit-state">${escapeJsonForHtml(JSON.stringify(snapshot))}</script>
<div id="app"></div>
<script type="module" src="/assets/slatecast.js"></script>
</body>
</html>
`
}
