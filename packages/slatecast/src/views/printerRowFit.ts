/**
 * How Printer Status arranges four or more printers, and how many it draws.
 *
 * Four printers get a 2×2 grid when the panel is tall enough to hold two cards
 * of facts. Otherwise, and for five or more, every printer is one compact row.
 * A panel has no scrollbar, so the view draws only the rows that FINISH on the
 * glass and never one the edge cuts in half (see
 * docs/decisions/2026-09-14-an-agenda-view-draws-only-the-rows-that-finish-on-the-panel.md).
 *
 * The printers it cannot draw are not dropped silently: a slim strip under the
 * last row says how many more there are and names them. The strip takes the
 * space of its own height, not of a whole row, so a 1280×720 panel still draws
 * nine rows above it.
 *
 * These numbers are the CSS's. `styles.css` sizes a row, the gap between rows
 * and the strip with the same values; a test measures both together.
 */

/** The shortest a row may be: a 48 px button plus the row's own padding. */
export const PRINTER_ROW_MIN_HEIGHT = 64

/** The space between two rows, and between the last row and the strip. */
export const PRINTER_ROW_GAP = 6

/** The height of the "+N more" strip under the last row. */
export const PRINTER_OVERFLOW_HEIGHT = 36

/**
 * The shortest card area that holds two quad cards, one above the other. A
 * card's facts and buttons measure 276 px, plus 26 px of padding and border,
 * twice, plus the 12 px gap. Below it, four printers use rows like five do.
 */
export const PRINTER_QUAD_MIN_HEIGHT = 624

/**
 * The narrowest card area that holds two quad cards side by side. Below it,
 * each card is under 300 px wide, too narrow for the name beside the state
 * chip and for the buttons' words, so a phone gets rows.
 */
export const PRINTER_QUAD_MIN_WIDTH = 600

/**
 * The narrowest card area where each quad card can put its picture BESIDE the
 * facts: two 560 px cards and the gap. A narrower grid stacks the picture
 * above the facts, as the one-to-three-printer columns do.
 */
export const PRINTER_QUAD_BESIDE_MIN_WIDTH = 1132

/** How a quad card arranges its picture and its facts. */
export const chooseQuadCardShape = (
  availableWidth: number,
) =>
  availableWidth >= PRINTER_QUAD_BESIDE_MIN_WIDTH
    ? "beside"
    : "stacked"

export type PrinterLayout = "columns" | "quad" | "list"

/** One, two and three printers keep their columns; four and up are new. */
export const choosePrinterLayout = ({
  availableHeight,
  availableWidth,
  printerCount,
}: {
  availableHeight: number
  availableWidth: number
  printerCount: number
}): PrinterLayout => {
  if (printerCount < 4) {
    return "columns"
  }
  if (
    printerCount === 4 &&
    availableHeight >= PRINTER_QUAD_MIN_HEIGHT &&
    availableWidth >= PRINTER_QUAD_MIN_WIDTH
  ) {
    return "quad"
  }
  return "list"
}

const countRowsThatFit = (availableHeight: number) =>
  Math.max(
    0,
    Math.floor(
      (availableHeight + PRINTER_ROW_GAP) /
        (PRINTER_ROW_MIN_HEIGHT + PRINTER_ROW_GAP),
    ),
  )

/**
 * How many printer rows to draw, and how many the strip reports as hidden.
 *
 * Every printer is drawn when every row fits. When one does not, the strip
 * takes its place at the foot, and the rows are counted again in the height
 * the strip leaves.
 */
export const fitPrinterRows = ({
  availableHeight,
  printerCount,
}: {
  availableHeight: number
  printerCount: number
}) => {
  if (printerCount <= countRowsThatFit(availableHeight)) {
    return { visibleCount: printerCount, hiddenCount: 0 }
  }
  const visibleCount = Math.min(
    printerCount,
    countRowsThatFit(
      availableHeight -
        PRINTER_OVERFLOW_HEIGHT -
        PRINTER_ROW_GAP,
    ),
  )
  return {
    visibleCount,
    hiddenCount: printerCount - visibleCount,
  }
}
