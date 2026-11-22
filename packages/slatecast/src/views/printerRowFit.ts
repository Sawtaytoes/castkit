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

/**
 * The widest view whose rows are TINY: too narrow for a band beside Pause
 * and Stop, so the name, the state, the job and the band stack in four lines
 * beside the buttons, and a row needs this much more height.
 */
export const PRINTER_ROW_TINY_MAX_WIDTH = 300

/** The shortest a tiny row may be: four lines and the row's padding. */
export const PRINTER_ROW_TINY_MIN_HEIGHT = 84

/** The shortest row a view of this width may draw. */
export const getPrinterRowMinHeight = (
  availableWidth: number,
) =>
  availableWidth <= PRINTER_ROW_TINY_MAX_WIDTH
    ? PRINTER_ROW_TINY_MIN_HEIGHT
    : PRINTER_ROW_MIN_HEIGHT

/** The space between two rows, and between the last row and the strip. */
export const PRINTER_ROW_GAP = 6

/** The height of the "+N more" strip under the last row. */
export const PRINTER_OVERFLOW_HEIGHT = 36

/*
 * Heights are the card area's. Widths are the view's content box: its width
 * less its own padding, the box the CSS container queries measure. Neither
 * moves with the arrangement, so the arrangement cannot undo itself.
 */

/**
 * The shortest card area that holds two quad cards, one above the other,
 * with the picture beside the facts. A card's facts and buttons measure
 * 276 px, plus 26 px of padding and border, twice, plus the 12 px gap.
 */
export const PRINTER_QUAD_MIN_HEIGHT = 624

/** The shortest picture a stacked quad card may draw above its facts. */
export const PRINTER_QUAD_STACKED_PLATE_MIN_HEIGHT = 96

/** The gap between a stacked card's picture and its facts. */
const PRINTER_QUAD_CARD_GAP = 10

/** The shortest card area that holds two stacked quad cards. */
export const PRINTER_QUAD_STACKED_MIN_HEIGHT =
  PRINTER_QUAD_MIN_HEIGHT +
  2 *
    (PRINTER_QUAD_STACKED_PLATE_MIN_HEIGHT +
      PRINTER_QUAD_CARD_GAP)

/**
 * The narrowest view that holds two quad cards side by side: two 294 px
 * cards and the gap. Below it, each card is too narrow for the name beside
 * the state chip and for the buttons' words, so a phone gets rows.
 */
export const PRINTER_QUAD_MIN_WIDTH = 600

/**
 * The narrowest view where each quad card can put its picture BESIDE the
 * facts: two 560 px cards and the gap. A narrower grid stacks the picture
 * above the facts, as the one-to-three-printer columns do, and needs the
 * taller card area the picture takes.
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
    printerCount !== 4 ||
    availableWidth < PRINTER_QUAD_MIN_WIDTH
  ) {
    return "list"
  }
  const minimumHeight =
    chooseQuadCardShape(availableWidth) === "beside"
      ? PRINTER_QUAD_MIN_HEIGHT
      : PRINTER_QUAD_STACKED_MIN_HEIGHT
  return availableHeight >= minimumHeight ? "quad" : "list"
}

const countRowsThatFit = ({
  availableHeight,
  rowMinHeight,
}: {
  availableHeight: number
  rowMinHeight: number
}) =>
  Math.max(
    0,
    Math.floor(
      (availableHeight + PRINTER_ROW_GAP) /
        (rowMinHeight + PRINTER_ROW_GAP),
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
  availableWidth,
  printerCount,
}: {
  availableHeight: number
  availableWidth: number
  printerCount: number
}) => {
  const rowMinHeight =
    getPrinterRowMinHeight(availableWidth)
  if (
    printerCount <=
    countRowsThatFit({ availableHeight, rowMinHeight })
  ) {
    return { visibleCount: printerCount, hiddenCount: 0 }
  }
  const visibleCount = Math.min(
    printerCount,
    countRowsThatFit({
      availableHeight:
        availableHeight -
        PRINTER_OVERFLOW_HEIGHT -
        PRINTER_ROW_GAP,
      rowMinHeight,
    }),
  )
  return {
    visibleCount,
    hiddenCount: printerCount - visibleCount,
  }
}
