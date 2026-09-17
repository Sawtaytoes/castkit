import type { IntentName } from "@charcuterie/tokens"
import type { EpaperPalette } from "@charcuterie/tokens/epaper"
import { epaperColours } from "@charcuterie/tokens/epaper"
import type { CSSProperties } from "react"
import type { ViewColorMode } from "./viewProps.ts"

/**
 * Style bits shared by every Inkcast view, so panel-wide constants (font,
 * background, Satori-safe flex column root) live in one place instead of being
 * copied into each component.
 *
 * Every color here comes from `@charcuterie/tokens/epaper`, which resolves to
 * literals precisely because Satori renders to PNG and cannot evaluate a
 * `var()`. Before M5b the views spelled their own inks — `#ffffff`, `#000000`,
 * `#1f4fd0` in four files, `rgb(255, 0, 0)` in a fifth — and none of those five
 * is a color this repo's own quantizer maps 1:1, so none of them was the
 * color that reached the panel.
 */

/**
 * The panel typeface, deliberately NOT one of charcuterie's three. Atkinson
 * Hyperlegible was picked for this hardware — a face designed for low-acuity
 * reading, at a distance, after a 1-bit dither eats the fine detail — and
 * `fitText` below is calibrated to its average glyph advance. Charcuterie ships
 * tokens here, not a typeface decision.
 */
export const PANEL_FONT_FAMILY =
  '"Atkinson Hyperlegible", "DejaVu Sans", sans-serif'

/**
 * castkit's color mode, in charcuterie's name for the same thing. `spectra6` is the
 * Spectra 6 Impression; `monochrome` is the 1-bit pHAT, and the two disagree about
 * white — an E Ink Spectra 6 panel's paper is `#D0D2D2`, the pHAT's is `#FFFFFF`.
 */
const EPAPER_PALETTE_BY_COLOR_MODE: Record<
  ViewColorMode,
  EpaperPalette
> = {
  spectra6: "spectra6",
  // `mono` and `epaperColours` are @charcuterie/tokens' own spelling of these
  // two names. Left as the library exports them; only our side is renamed.
  monochrome: "mono",
  // Sixteen grays is still one ink: no intent may carry a hue, so a view lays
  // out exactly as it does for mono. Only the dither step downstream differs.
  grayscale: "mono",
}

/** Every ink available to a view, for the panel it is being rendered for. */
export const getPanelColors = ({
  colorMode,
}: {
  colorMode: ViewColorMode
}) => epaperColours[EPAPER_PALETTE_BY_COLOR_MODE[colorMode]]

/** The Satori-safe base every view's root element starts from. */
export const buildPanelRootStyle = ({
  width,
  height,
  colorMode,
}: {
  width: number
  height: number
  colorMode: ViewColorMode
}): CSSProperties => {
  const colors = getPanelColors({ colorMode })

  return {
    width,
    height,
    display: "flex",
    flexDirection: "column",
    backgroundColor: colors.surface.base,
    color: colors.content.primary,
    fontFamily: PANEL_FONT_FAMILY,
    boxSizing: "border-box",
  }
}

/**
 * A view's accent ink, named by intent rather than by hex.
 *
 * **On a six-ink panel the intent scale *is* the ink set** — accent is the
 * blue, danger the red, warning the yellow, success the green — so a view
 * choosing a color is choosing an intent whether it says so or not. Saying so
 * is what makes the mono collapse free: `monochrome` maps every intent to black, so
 * the `colorMode === "spectra6" ? … : "#000000"` ternary this replaced is now a
 * property of the profile rather than a line each view could forget.
 */
export const getAccentColor = ({
  colorMode,
  intent,
}: {
  colorMode: ViewColorMode
  intent: IntentName
}) => getPanelColors({ colorMode }).intent[intent].solid

/**
 * Average glyph advance of Atkinson Hyperlegible, as a fraction of the font
 * size. Multiplying `fontSize × ratio × characterCount` estimates a line's
 * rendered width without measuring text (neither render engine exposes
 * metrics to the view).
 */
const AVERAGE_GLYPH_ADVANCE_RATIO = 0.52

/**
 * The most a line may be condensed, as a fraction of the font size subtracted
 * from each glyph's advance (i.e. the tightest negative `letterSpacing`, in
 * em). Squishing buys horizontal room *without* shrinking the glyphs, so it is
 * tried before the font shrinks — but only this far: past it the letters start
 * touching and legibility collapses, which is the "maximum" the maintainer
 * asked for on the squish lever.
 */
const MAXIMUM_CONDENSE_EM = 0.06

/**
 * Absolute floor (px) a fitted line may shrink to before the view should wrap
 * or ellipsis-truncate instead of shrinking further. Below these the text
 * stops being readable across a room / after 1-bit dithering, which is the
 * bug this guards against (a long title shrank until it was illegible). Split
 * by panel because the mono pHAT dithers fine detail away sooner than the E Ink Spectra 6.
 */
export const READABLE_FONT_FLOOR_PX = {
  monochrome: 15,
  // Anti-aliased edges survive a 16-level quantize, but the same floor as
  // mono until a step wedge on the glass says otherwise.
  grayscale: 15,
  spectra6: 24,
} as const

/** Round a letter-spacing to a tenth of a pixel — granular but tidy. */
const roundLetterSpacing = (value: number) =>
  Math.round(value * 10) / 10

/**
 * Shrink-and-condense-to-fit sizing for one line of text, with explicit
 * minimums and maximums on every lever. Estimates the rendered width as
 * `fontSize × 0.52 × text.length` (the Atkinson Hyperlegible average advance)
 * and fits it to `availableWidth × lineCount` in three ordered stages, each
 * preserving legibility as long as it can:
 *
 * 1. **Fits at full size** → base font, normal spacing.
 * 2. **Slightly too wide** → keep the full font size and *condense* the
 *    letter-spacing just enough to fit, up to `MAXIMUM_CONDENSE_EM`. Big
 *    glyphs, tighter tracking — far more legible than a smaller font.
 * 3. **Too wide even fully condensed** → shrink the font (holding max
 *    condense), but never below `minimumFontSize`. At the floor the line stops
 *    shrinking; the caller must wrap (raise `lineCount`) or keep an ellipsis
 *    truncation style so the overflow is clipped, not rendered unreadably
 *    small.
 *
 * Returns both the `fontSize` and the `letterSpacing` (0 or negative) the
 * caller should apply to the line.
 */
export const fitText = ({
  baseFontSize,
  minimumFontSize,
  availableWidth,
  text,
  lineCount = 1,
}: {
  baseFontSize: number
  /** Readable floor (px); pass `READABLE_FONT_FLOOR_PX[colorMode]`. */
  minimumFontSize: number
  availableWidth: number
  text: string
  /** Lines the text may wrap across (width budget = width × lines). */
  lineCount?: number
}) => {
  const characterCount = text.length
  if (characterCount === 0) {
    return { fontSize: baseFontSize, letterSpacing: 0 }
  }

  const widthBudget = availableWidth * lineCount
  const requiredAdvanceRatio =
    widthBudget / (baseFontSize * characterCount)

  // 1. Fits at full size with normal spacing.
  if (requiredAdvanceRatio >= AVERAGE_GLYPH_ADVANCE_RATIO) {
    return { fontSize: baseFontSize, letterSpacing: 0 }
  }

  const tightestAdvanceRatio =
    AVERAGE_GLYPH_ADVANCE_RATIO - MAXIMUM_CONDENSE_EM

  // 2. Fits at full size by condensing letter-spacing (glyphs stay big).
  if (requiredAdvanceRatio >= tightestAdvanceRatio) {
    const condenseEm =
      AVERAGE_GLYPH_ADVANCE_RATIO - requiredAdvanceRatio
    return {
      fontSize: baseFontSize,
      letterSpacing: roundLetterSpacing(
        -condenseEm * baseFontSize,
      ),
    }
  }

  // 3. Too wide even fully condensed → shrink at max condense, but never
  //    below the readable floor. The caller's wrap/ellipsis handles the rest.
  const fittedFontSize =
    widthBudget / (tightestAdvanceRatio * characterCount)
  const clampedFontSize = Math.max(
    Math.round(fittedFontSize),
    minimumFontSize,
  )
  return {
    fontSize: clampedFontSize,
    letterSpacing: roundLetterSpacing(
      -MAXIMUM_CONDENSE_EM * clampedFontSize,
    ),
  }
}

/**
 * How many equal-height rows finish inside `availableHeight`.
 *
 * A panel has no scrollbar and an ePaper panel has no second chance: a row the
 * layout starts but cannot finish is simply cut in half by the glass edge, and
 * on a centered column it pushes the anchor off the *top* edge as well. So a
 * view asks this how many rows it may draw and renders only those — the rows
 * it drops are the least imminent ones, which arrive on a later repaint as the
 * earlier ones fall off the front of the list.
 *
 * `rowHeight` is the full cost of one row: its own leading gap plus its ink
 * height (`fontSize × lineHeight`, rounded up — a fractional line box still
 * occupies a whole pixel row).
 */
export const countRowsThatFit = ({
  availableHeight,
  rowHeight,
}: {
  availableHeight: number
  /** Leading gap + ink height of one row, in px. */
  rowHeight: number
}) => {
  if (rowHeight <= 0) {
    return 0
  }
  return Math.max(
    0,
    Math.floor(availableHeight / rowHeight),
  )
}
