import type { CSSProperties } from "react"
import type { ViewColourMode } from "./viewProps.ts"

/**
 * Style bits shared by every Inkcast view, so panel-wide constants (font,
 * background, Satori-safe flex column root) live in one place instead of being
 * copied into each component.
 */

export const PANEL_FONT_FAMILY =
  '"Atkinson Hyperlegible", "DejaVu Sans", sans-serif'

/** The Satori-safe base every view's root element starts from. */
export const buildPanelRootStyle = ({
  width,
  height,
}: {
  width: number
  height: number
}): CSSProperties => ({
  width,
  height,
  display: "flex",
  flexDirection: "column",
  backgroundColor: "#ffffff",
  color: "#000000",
  fontFamily: PANEL_FONT_FAMILY,
  boxSizing: "border-box",
})

/** A view's accent ink: the given E6 colour, collapsing to black on mono. */
export const getAccentColour = ({
  colourMode,
  e6Colour,
}: {
  colourMode: ViewColourMode
  e6Colour: string
}) => (colourMode === "e6" ? e6Colour : "#000000")

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
 * by panel because the mono pHAT dithers fine detail away sooner than the E6.
 */
export const READABLE_FONT_FLOOR_PX = {
  mono: 15,
  e6: 24,
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
  /** Readable floor (px); pass `READABLE_FONT_FLOOR_PX[colourMode]`. */
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
