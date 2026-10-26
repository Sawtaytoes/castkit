import { Resvg } from "@resvg/resvg-js"
import { FONT_FAMILY, FONT_FILE_PATHS } from "./fonts.ts"

const escapeText = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")

/**
 * One line of panel text as a coverage mask: 0 where the background shows,
 * 255 where the glyph is solid. A caller blends it over pixels it already
 * holds, so a frame composed without a browser keeps the panel face.
 */
export const renderTextMask = ({
  text,
  width,
  height,
  fontSize,
  align = "start",
  isBold = true,
}: {
  text: string
  width: number
  height: number
  fontSize: number
  align?: "start" | "end"
  isBold?: boolean
}) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><text x="${align === "end" ? width : 0}" y="${Math.round(height / 2 + fontSize * 0.35)}" font-family="${FONT_FAMILY}, Noto Sans JP" font-size="${fontSize}" font-weight="${isBold ? 700 : 400}" text-anchor="${align}" fill="#fff">${escapeText(text)}</text></svg>`
  const rendered = new Resvg(svg, {
    font: {
      fontFiles: [
        isBold
          ? FONT_FILE_PATHS.bold
          : FONT_FILE_PATHS.regular,
        isBold
          ? FONT_FILE_PATHS.japaneseBold
          : FONT_FILE_PATHS.japaneseRegular,
      ],
      loadSystemFonts: false,
      defaultFontFamily: FONT_FAMILY,
    },
  }).render()
  const pixels = rendered.pixels
  const coverage = Uint8Array.from(
    { length: rendered.width * rendered.height },
    (_, index) => pixels[index * 4 + 3] ?? 0,
  )
  return {
    width: rendered.width,
    height: rendered.height,
    coverage,
  }
}
