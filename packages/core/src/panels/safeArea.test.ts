import { describe, expect, test } from "vitest"
import { resolveSafeArea } from "./safeArea.ts"

describe("resolveSafeArea", () => {
  test("no inset leaves the content box at full panel size", () => {
    expect(
      resolveSafeArea({ width: 800, height: 480 }),
    ).toEqual({
      inset: { top: 0, right: 0, bottom: 0, left: 0 },
      hasInset: false,
      contentWidth: 800,
      contentHeight: 480,
    })
  })

  test("an all-zero inset is not an inset", () => {
    const { hasInset } = resolveSafeArea({
      width: 800,
      height: 480,
      safeAreaInset: {
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
      },
    })

    expect(hasInset).toBe(false)
  })

  test("asymmetric insets shrink the box by each edge independently", () => {
    expect(
      resolveSafeArea({
        width: 800,
        height: 480,
        safeAreaInset: {
          top: 10,
          right: 20,
          bottom: 30,
          left: 40,
        },
      }),
    ).toEqual({
      inset: { top: 10, right: 20, bottom: 30, left: 40 },
      hasInset: true,
      contentWidth: 740,
      contentHeight: 440,
    })
  })

  test("insets wider than the panel clamp to a 1×1 content box", () => {
    const { contentWidth, contentHeight } = resolveSafeArea(
      {
        width: 250,
        height: 122,
        safeAreaInset: {
          top: 500,
          right: 500,
          bottom: 500,
          left: 500,
        },
      },
    )

    expect(contentWidth).toBe(1)
    expect(contentHeight).toBe(1)
  })

  test("one oversized edge cannot push the opposite edge negative", () => {
    const { inset, contentWidth } = resolveSafeArea({
      width: 250,
      height: 122,
      safeAreaInset: {
        top: 0,
        right: 100,
        bottom: 0,
        left: 400,
      },
    })

    expect(inset.left).toBe(249)
    expect(inset.right).toBe(0)
    expect(contentWidth).toBe(1)
  })

  test("negative insets are treated as zero", () => {
    const { inset, hasInset } = resolveSafeArea({
      width: 800,
      height: 480,
      safeAreaInset: {
        top: -10,
        right: -10,
        bottom: -10,
        left: -10,
      },
    })

    expect(inset).toEqual({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    })
    expect(hasInset).toBe(false)
  })
})
