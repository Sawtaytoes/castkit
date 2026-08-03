import boldFontUrl from "@castkit/render/assets/fonts/AtkinsonHyperlegible-Bold.ttf?url"
import regularFontUrl from "@castkit/render/assets/fonts/AtkinsonHyperlegible-Regular.ttf?url"

/**
 * The panel faces as CSS, for every browser preview of a view.
 *
 * Without this the previews lie. `PANEL_FONT_FAMILY` in `@castkit/views` asks
 * for "Atkinson Hyperlegible", nothing in a normal browser has it, and the view
 * silently falls back to the system sans-serif — while production Chromium
 * embeds these exact faces as base64 `@font-face` (`buildFontFaceCss` in
 * `@castkit/render/chromiumEngine`) so the device render is identical
 * everywhere. `fitText` also calibrates its average-advance constant against
 * Atkinson, so a fallback font mismeasures every overflow decision.
 *
 * Regular (400) and Bold (700) only, deliberately mirroring the Chromium
 * engine: DejaVu ships alongside as a *Satori* fallback, because Satori has no
 * system fonts at all. Chromium falls through to system fonts for glyphs
 * Atkinson lacks, and so should the browser.
 */

/** The `font-family` the views ask for. Matches `FONT_FAMILY` in @castkit/render. */
const PANEL_FONT_FAMILY = "Atkinson Hyperlegible"

const buildFontFaceRule = ({
  source,
  weight,
}: {
  source: string
  weight: number
}) => `@font-face {
  font-family: "${PANEL_FONT_FAMILY}";
  font-weight: ${weight};
  font-style: normal;
  src: url(${source}) format("truetype");
}`

/**
 * The faces referenced by URL — for anything rendered *on screen* (the
 * Storybook preview, the Vite dev app). The browser fetches the TTF normally,
 * so there is no base64 weight to carry.
 */
export const PANEL_FONT_FACE_URL_CSS = [
  buildFontFaceRule({
    source: regularFontUrl,
    weight: 400,
  }),
  buildFontFaceRule({ source: boldFontUrl, weight: 700 }),
].join("\n")

const readAsDataUri = async (fontUrl: string) => {
  const response = await fetch(fontUrl)
  const fontBlob = await response.blob()
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      resolve(String(reader.result))
    }
    reader.onerror = () => {
      reject(reader.error)
    }
    reader.readAsDataURL(fontBlob)
  })
}

const dataUriCssPromise: {
  current: Promise<string> | null
} = {
  current: null,
}

/**
 * The faces inlined as `data:` URIs — required by the foreignObject rasterizer
 * and by nothing else. An SVG loaded through `<img>` cannot fetch any external
 * subresource, so a `url()` face would silently rasterize in the fallback font
 * and quietly produce the wrong pixels to dither.
 *
 * Vite leaves a 55 KB TTF as a file (`assetsInlineLimit` is 4 KB), so the bytes
 * are fetched at runtime and the result memoised for the session.
 */
export const loadPanelFontFaceDataUriCss = async () => {
  const cached = dataUriCssPromise.current
  if (cached) {
    return cached
  }

  const pending = Promise.all([
    readAsDataUri(regularFontUrl),
    readAsDataUri(boldFontUrl),
  ]).then(([regularDataUri, boldDataUri]) =>
    [
      buildFontFaceRule({
        source: regularDataUri,
        weight: 400,
      }),
      buildFontFaceRule({
        source: boldDataUri,
        weight: 700,
      }),
    ].join("\n"),
  )

  dataUriCssPromise.current = pending
  return pending
}

/**
 * Install the panel faces into the document and resolve once they are actually
 * usable. Callers that measure or rasterize MUST await this — the same guard
 * the Chromium engine applies before screenshotting, for the same reason.
 */
export const installPanelFonts = async () => {
  const styleElementId = "castkit-panel-fonts"
  if (!document.getElementById(styleElementId)) {
    const styleElement = document.createElement("style")
    styleElement.id = styleElementId
    styleElement.textContent = PANEL_FONT_FACE_URL_CSS
    document.head.append(styleElement)
  }
  await document.fonts.ready
}
