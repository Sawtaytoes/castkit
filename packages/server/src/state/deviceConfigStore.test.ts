import { resolveSafeArea } from "@castkit/core/panels/safeArea"
import { describe, expect, test } from "vitest"
import { createDeviceConfigStore } from "./deviceConfigStore.ts"

const DEVICE_ID = "kitchen"

describe("deviceConfigStore.getMargin", () => {
  test("an untouched device reads as no mat at all", () => {
    expect(
      createDeviceConfigStore().getMargin(DEVICE_ID),
    ).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
  })

  test("a partly configured mat reads 0 for the edges nobody set", () => {
    const store = createDeviceConfigStore()
    store.setMarginEdge({
      deviceId: DEVICE_ID,
      edge: "left",
      pixels: 59,
    })

    expect(store.getMargin(DEVICE_ID)).toEqual({
      top: 0,
      right: 0,
      bottom: 0,
      left: 59,
    })
  })

  test("insets are per device, not shared", () => {
    const store = createDeviceConfigStore()
    store.setMarginEdge({
      deviceId: DEVICE_ID,
      edge: "top",
      pixels: 36,
    })

    expect(store.getMargin("office").top).toBe(0)
    expect(store.getMargin(DEVICE_ID).top).toBe(36)
  })

  test("the mat shrinks the box a photo is composed into", () => {
    // The Kitchen Counter display: an 800x480 panel behind a mat, so a photo
    // view composes at 678x416 and the margin under the mat renders white.
    const store = createDeviceConfigStore()
    const mat = {
      top: 36,
      right: 63,
      bottom: 28,
      left: 59,
    } as const
    Object.entries(mat).forEach(([edge, pixels]) => {
      store.setMarginEdge({
        deviceId: DEVICE_ID,
        edge: edge as "top" | "right" | "bottom" | "left",
        pixels,
      })
    })

    const { contentWidth, contentHeight } = resolveSafeArea(
      {
        width: 800,
        height: 480,
        margin: store.getMargin(DEVICE_ID),
      },
    )

    expect(contentWidth).toBe(678)
    expect(contentHeight).toBe(416)
  })
})
