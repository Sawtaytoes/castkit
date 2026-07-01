import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import type { Font } from "satori"

/**
 * Font buffers for the Satori engine. Satori has no system-font access — it
 * needs the raw TTF bytes — so we ship DejaVu Sans (the same family the pHAT
 * draws with on-device via `fonts-dejavu`, keeping server and panel visually
 * consistent). Chromium loads DejaVu itself, so this is Satori-only.
 */

const assetsDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  "assets",
  "fonts",
)

/** The CSS `font-family` the views reference; Satori matches fonts by name. */
export const FONT_FAMILY = "DejaVu Sans"

/** Absolute paths to the TTF faces, for tools that load fonts by path (resvg). */
export const FONT_FILE_PATHS = {
  regular: join(assetsDirectory, "DejaVuSans.ttf"),
  bold: join(assetsDirectory, "DejaVuSans-Bold.ttf"),
}

/** Load the regular + bold DejaVu Sans faces as Satori font descriptors. */
export const loadSatoriFonts = async (): Promise<
  Font[]
> => {
  const [regularData, boldData] = await Promise.all([
    readFile(join(assetsDirectory, "DejaVuSans.ttf")),
    readFile(join(assetsDirectory, "DejaVuSans-Bold.ttf")),
  ])

  return [
    {
      name: FONT_FAMILY,
      data: regularData,
      weight: 400,
      style: "normal",
    },
    {
      name: FONT_FAMILY,
      data: boldData,
      weight: 700,
      style: "normal",
    },
  ]
}
