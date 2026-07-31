import { existsSync } from "node:fs"
import { resolve } from "node:path"
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
 * The device's theme setting as `@charcuterie/tokens` spells it. Only "Light"
 * is light: "Auto" stays dark because a kiosk browser reports
 * `prefers-color-scheme: light` by default and a wall display wants dark.
 *
 * Stamped into the shell rather than applied by the SPA so the very first
 * paint is already the right colour — the alternative is a dark page flashing
 * white on every reload of a display nobody is sitting in front of.
 */
const resolveScheme = (
  theme: BrowserDeviceSettings["theme"],
) => (theme === "Light" ? "light" : "dark")

export const buildDevicePageHtml = ({
  snapshot,
}: {
  snapshot: Extract<
    ServerToClientMessage,
    { type: "snapshot" }
  >
}) => {
  const { device } = snapshot
  return `<!doctype html>
<html lang="en" data-shape="${device.shape}" data-touch="${device.hasTouch}" data-colour="${device.colour}" data-scheme="${resolveScheme(snapshot.settings.theme)}" data-density="kiosk">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no" />
<meta name="color-scheme" content="dark light" />
<title>${device.label} · CastKit</title>
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
