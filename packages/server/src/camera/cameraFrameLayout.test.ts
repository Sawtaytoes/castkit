import { inflateSync } from "node:zlib"
import { expect, test } from "vitest"
import {
  composeCameraFrame,
  cropRgb565,
  getCameraFrameLayout,
  type RenderTextMask,
  toRgb565,
} from "./cameraFrameLayout.ts"

const blankText: RenderTextMask = ({ width, height }) => ({
  width,
  height,
  coverage: new Uint8Array(width * height),
})

test("a 4:3 camera on a 480x480 panel keeps its aspect between two label bands", () => {
  const layout = getCameraFrameLayout({
    width: 480,
    height: 480,
    sourceWidth: 480,
    sourceHeight: 360,
  })
  expect(layout.camera).toEqual({
    x: 0,
    y: 60,
    width: 480,
    height: 360,
  })
  expect(layout.header).toEqual({
    x: 0,
    y: 0,
    width: 480,
    height: 60,
  })
  // Each picture redraws only the camera; the label band stays put.
  expect(layout.patch).toEqual(layout.camera)
})

test("a 4:3 camera on a 480x320 landscape panel fills the height and redraws whole frames", () => {
  const layout = getCameraFrameLayout({
    width: 480,
    height: 320,
    sourceWidth: 480,
    sourceHeight: 360,
  })
  expect(layout.camera).toEqual({
    x: 26,
    y: 0,
    width: 427,
    height: 320,
  })
  expect(layout.header).toBeUndefined()
  expect(layout.patch).toEqual({
    x: 0,
    y: 0,
    width: 480,
    height: 320,
  })
})

test("RGB565 is big-endian, five, six and five bits", () => {
  expect([
    ...toRgb565(
      Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255]),
    ),
  ]).toEqual([0xf8, 0x00, 0x07, 0xe0, 0x00, 0x1f])
})

test("the patch body inflates to exactly the camera rectangle of the frame", async () => {
  const layout = getCameraFrameLayout({
    width: 480,
    height: 480,
    sourceWidth: 480,
    sourceHeight: 360,
  })
  // A synthetic gradient stands in for a camera picture.
  const camera = Buffer.from(
    Array.from(
      { length: 480 * 360 * 3 },
      (_, index) => Math.floor(index / 3) % 256,
    ),
  )
  const { pixels, body } = await composeCameraFrame({
    layout,
    camera,
    label: "Door",
    status: "Live",
    time: "3:42:15 PM",
    renderText: blankText,
  })
  expect(pixels.length).toBe(480 * 480 * 2)
  expect(
    inflateSync(body).equals(
      cropRgb565({
        pixels,
        width: 480,
        rectangle: layout.patch,
      }),
    ),
  ).toBe(true)
  // The top band is black; the first camera row carries the picture.
  expect(pixels.readUInt16BE(0)).toBe(0)
  expect(pixels.readUInt16BE((60 * 480 + 5) * 2)).toBe(
    toRgb565(Buffer.from([5, 5, 5])).readUInt16BE(0),
  )
})
