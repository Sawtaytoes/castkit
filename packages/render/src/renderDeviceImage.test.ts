import {
  IMPRESSION_DEVICE,
  PHAT_DEVICE,
} from "@castkit/core/devices/device"
import { createElement } from "react"
import sharp from "sharp"
import { describe, expect, test } from "vitest"
import type { RenderEngine } from "./engine.ts"
import { renderDeviceImage } from "./renderDeviceImage.ts"

/**
 * A stub engine that returns a solid full-color PNG at the supersampled size
 * the contract promises — so this test exercises the render→dither composition
 * without launching Chromium.
 */
const createStubEngine = (): RenderEngine => ({
  name: "chromium",
  render: ({ width, height, supersampleFactor }) =>
    sharp({
      create: {
        width: width * supersampleFactor,
        height: height * supersampleFactor,
        channels: 3,
        background: { r: 120, g: 60, b: 200 },
      },
    })
      .png()
      .toBuffer(),
})

const paletteKeys = (
  palette: readonly (readonly [number, number, number])[],
) =>
  new Set(
    palette.map(
      (color) => `${color[0]},${color[1]},${color[2]}`,
    ),
  )

describe("renderDeviceImage", () => {
  test.each([
    { device: PHAT_DEVICE },
    { device: IMPRESSION_DEVICE },
  ])("produces a native-sized, palette-conformant image for $device.id", async ({
    device,
  }) => {
    const output = await renderDeviceImage({
      engine: createStubEngine(),
      element: createElement("div"),
      device,
    })

    const { data, info } = await sharp(output)
      .raw()
      .toBuffer({ resolveWithObject: true })

    // rotation 0 and 180 both preserve the native dimensions.
    expect(info.width).toBe(device.width)
    expect(info.height).toBe(device.height)

    const allowed = paletteKeys(device.palette)
    const offendingColors = new Set<string>()
    Array.from({
      length: info.width * info.height,
    }).forEach((_unused, pixelIndex) => {
      const byteOffset = pixelIndex * info.channels
      const key = `${data[byteOffset]},${data[byteOffset + 1]},${data[byteOffset + 2]}`
      if (!allowed.has(key)) {
        offendingColors.add(key)
      }
    })

    // Collect, then assert once. One expect() per pixel is 384k calls on the
    // Impression, which took ~6.5 s on CI against a 5 s timeout — and the set
    // of off-palette colors localizes a dither bug better than the first bad
    // pixel's index does.
    expect(Array.from(offendingColors)).toEqual([])
  })
})
