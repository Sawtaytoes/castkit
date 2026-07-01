import { Resvg } from "@resvg/resvg-js"
import satori from "satori"
import type {
  RenderEngine,
  RenderRequest,
} from "./engine.ts"
import { loadSatoriFonts } from "./fonts.ts"

/**
 * The Satori render engine (the lighter fast-path to evaluate against
 * Chromium). Satori turns the React element straight into an SVG — no browser —
 * which resvg then rasterizes to PNG. Fast, deterministic, light.
 *
 * Caveats the bake-off must surface: Satori supports only a CSS subset (flexbox,
 * inline styles; no grid/filters) and the Vite browser dev-preview will NOT
 * exactly match its output, eroding the WYSIWYG-editor goal. Good for simple
 * card screens; compare, don't assume.
 */
export const createSatoriEngine =
  async (): Promise<RenderEngine> => {
    const fonts = await loadSatoriFonts()

    const render = async ({
      element,
      width,
      height,
      supersampleFactor,
    }: RenderRequest): Promise<Buffer> => {
      // Satori renders at native size; resvg upscales by supersampleFactor so
      // the output matches the Chromium engine's supersampled dimensions.
      const svgMarkup = await satori(element, {
        width,
        height,
        fonts,
      })

      const resvg = new Resvg(svgMarkup, {
        fitTo: {
          mode: "width",
          value: width * supersampleFactor,
        },
      })

      return Buffer.from(resvg.render().asPng())
    }

    return { name: "satori", render }
  }
