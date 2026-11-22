import { describe, expect, test } from "vitest"
import {
  choosePrinterLayout,
  chooseQuadCardShape,
  fitPrinterRows,
  PRINTER_QUAD_BESIDE_MIN_WIDTH,
  PRINTER_QUAD_MIN_HEIGHT,
  PRINTER_QUAD_STACKED_MIN_HEIGHT,
} from "./printerRowFit.ts"

/** The 1280x720 workbench panel's card area: 720 less 18 px top and bottom. */
const WORKBENCH_HEIGHT = 684

/** The workbench panel's view width. */
const WORKBENCH_WIDTH = 1280

/** The 480x320 short panel's card area. */
const SHORT_PANEL_HEIGHT = 284

describe("choosePrinterLayout", () => {
  test("one to three printers keep their columns", () => {
    expect(
      [1, 2, 3].map((printerCount) =>
        choosePrinterLayout({
          availableHeight: WORKBENCH_HEIGHT,
          availableWidth: WORKBENCH_WIDTH,
          printerCount,
        }),
      ),
    ).toEqual(["columns", "columns", "columns"])
  })

  test("four printers make a 2×2 grid on a tall enough panel", () => {
    expect(
      choosePrinterLayout({
        availableHeight: WORKBENCH_HEIGHT,
        availableWidth: WORKBENCH_WIDTH,
        printerCount: 4,
      }),
    ).toBe("quad")
  })

  test("four printers use rows where two cards would not stack", () => {
    expect(
      choosePrinterLayout({
        availableHeight: SHORT_PANEL_HEIGHT,
        availableWidth: 480,
        printerCount: 4,
      }),
    ).toBe("list")
  })

  test("four printers use rows one pixel under the grid's height", () => {
    expect(
      [
        PRINTER_QUAD_MIN_HEIGHT - 1,
        PRINTER_QUAD_MIN_HEIGHT,
      ].map((availableHeight) =>
        choosePrinterLayout({
          availableHeight,
          availableWidth: WORKBENCH_WIDTH,
          printerCount: 4,
        }),
      ),
    ).toEqual(["list", "quad"])
  })

  test("a stacked grid needs room for its pictures too", () => {
    expect(
      [
        PRINTER_QUAD_STACKED_MIN_HEIGHT - 1,
        PRINTER_QUAD_STACKED_MIN_HEIGHT,
      ].map((availableHeight) =>
        choosePrinterLayout({
          availableHeight,
          availableWidth: 720,
          printerCount: 4,
        }),
      ),
    ).toEqual(["list", "quad"])
  })

  test("four printers use rows on a phone, however tall", () => {
    expect(
      choosePrinterLayout({
        availableHeight: 788,
        availableWidth: 360,
        printerCount: 4,
      }),
    ).toBe("list")
  })

  test("five printers and up use rows", () => {
    expect(
      [5, 9, 10].map((printerCount) =>
        choosePrinterLayout({
          availableHeight: WORKBENCH_HEIGHT,
          availableWidth: WORKBENCH_WIDTH,
          printerCount,
        }),
      ),
    ).toEqual(["list", "list", "list"])
  })
})

describe("fitPrinterRows", () => {
  test("the workbench panel draws nine rows and hides nothing", () => {
    expect(
      fitPrinterRows({
        availableHeight: WORKBENCH_HEIGHT,
        printerCount: 9,
      }),
    ).toEqual({ visibleCount: 9, hiddenCount: 0 })
  })

  test("a tenth printer goes in the strip, and nine rows still fit above it", () => {
    expect(
      fitPrinterRows({
        availableHeight: WORKBENCH_HEIGHT,
        printerCount: 10,
      }),
    ).toEqual({ visibleCount: 9, hiddenCount: 1 })
  })

  test("every printer past the ninth is counted as hidden", () => {
    expect(
      fitPrinterRows({
        availableHeight: WORKBENCH_HEIGHT,
        printerCount: 12,
      }),
    ).toEqual({ visibleCount: 9, hiddenCount: 3 })
  })

  test("the strip costs a row when the rows only just fit without it", () => {
    expect(
      fitPrinterRows({
        availableHeight: SHORT_PANEL_HEIGHT,
        printerCount: 4,
      }),
    ).toEqual({ visibleCount: 4, hiddenCount: 0 })
    expect(
      fitPrinterRows({
        availableHeight: SHORT_PANEL_HEIGHT,
        printerCount: 5,
      }),
    ).toEqual({ visibleCount: 3, hiddenCount: 2 })
  })

  test("a card area too short for one row draws none and hides all", () => {
    expect(
      fitPrinterRows({
        availableHeight: 40,
        printerCount: 5,
      }),
    ).toEqual({ visibleCount: 0, hiddenCount: 5 })
  })
})

describe("chooseQuadCardShape", () => {
  test("the workbench panel puts the picture beside the facts", () => {
    expect(chooseQuadCardShape(WORKBENCH_WIDTH)).toBe(
      "beside",
    )
  })

  test("a narrower grid stacks the picture above the facts", () => {
    expect(
      [
        PRINTER_QUAD_BESIDE_MIN_WIDTH - 1,
        PRINTER_QUAD_BESIDE_MIN_WIDTH,
      ].map(chooseQuadCardShape),
    ).toEqual(["stacked", "beside"])
  })
})
