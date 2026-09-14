import { describe, expect, test } from "vitest"
import { getIsGrayscaleTextRequired } from "./pixelGrid.ts"

describe("getIsGrayscaleTextRequired", () => {
  test("a panel with no stripe always antialiases in gray", () => {
    for (const orientation of [0, 90, 180, 270] as const) {
      expect(
        getIsGrayscaleTextRequired({
          orientation,
          pixelGrid: "none",
        }),
      ).toBe(true)
    }
  })

  test("a stripe hung the way Chromium assumes keeps subpixel text", () => {
    expect(
      getIsGrayscaleTextRequired({
        orientation: 0,
        pixelGrid: "rgb-stripe",
      }),
    ).toBe(false)
  })

  /*
   * A half turn keeps the stripe horizontal. It reverses the order — an RGB
   * panel upside down is a BGR panel — so the fringe is on the right axis and
   * the wrong side, which is a `pixelGrid` value to fix, not a reason to
   * abandon subpixel rendering.
   */
  test("a half turn keeps the stripe horizontal", () => {
    expect(
      getIsGrayscaleTextRequired({
        orientation: 180,
        pixelGrid: "bgr-stripe",
      }),
    ).toBe(false)
  })

  test("a quarter turn puts the stripe on the wrong axis", () => {
    for (const orientation of [90, 270] as const) {
      expect(
        getIsGrayscaleTextRequired({
          orientation,
          pixelGrid: "rgb-stripe",
        }),
      ).toBe(true)
    }
  })
})
