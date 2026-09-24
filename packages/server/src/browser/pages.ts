import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
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

/**
 * The files whose bytes decide whether a loaded page is the build this server
 * is serving. Both are pinned names (see slatecast's `vite.config.ts`), so the
 * URL cannot tell a panel that the bytes behind it changed.
 */
const BUILD_ID_FILE_NAMES = [
  "assets/slatecast.js",
  "assets/slatecast.css",
]

/** No build on disk: one constant id, so nothing is ever asked to reload. */
const UNKNOWN_BUILD_ID = "unknown"

const buildIdCache: { value: string | null } = {
  value: null,
}

/**
 * A short content hash of the Slatecast bundle this server serves.
 *
 * It exists because a live-browser panel holds its page for weeks — the one at
 * the 3D printer workbench had been up since a deploy two days earlier — while
 * the server behind it restarts on every deploy. The socket reconnects, so the
 * panel looks healthy and answers every push, but it is running the PREVIOUS
 * bundle. On 2026-09-23 that panel was told to show `printer-status`, a view
 * its bundle did not have, and it silently fell back to Now Playing: two prints
 * running and "Nothing playing" on the glass.
 *
 * The hash is read once and cached. The dist directory is baked into the image,
 * so it cannot change while this process lives, and re-reading the bundle on
 * every page load and every reconnect would be pure cost.
 *
 * A content hash rather than a start timestamp on purpose: restarting the same
 * build must NOT reload the panels. A container that restart-loops would
 * otherwise reload every display in the house on each attempt.
 */
export const resolveSlatecastBuildId = (): string => {
  if (buildIdCache.value !== null) {
    return buildIdCache.value
  }
  const distDir = resolveSlatecastDistDir()
  if (!distDir) {
    buildIdCache.value = UNKNOWN_BUILD_ID
    return buildIdCache.value
  }
  const hash = createHash("sha256")
  let hasReadAnyFile = false
  for (const fileName of BUILD_ID_FILE_NAMES) {
    const filePath = resolve(distDir, fileName)
    if (!existsSync(filePath)) {
      continue
    }
    hash.update(readFileSync(filePath))
    hasReadAnyFile = true
  }
  buildIdCache.value = hasReadAnyFile
    ? hash.digest("hex").slice(0, 12)
    : UNKNOWN_BUILD_ID
  return buildIdCache.value
}

/** Exported for tests: drops the memoized hash so a fixture build is re-read. */
export const __resetSlatecastBuildIdForTests = () => {
  buildIdCache.value = null
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
