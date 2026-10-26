import { inflateSync } from "node:zlib"
import sharp from "sharp"
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

test("a JPEG patch is a baseline JPEG of exactly the patch rectangle, close to the frame", async () => {
  const layout = getCameraFrameLayout({
    width: 480,
    height: 480,
    sourceWidth: 480,
    sourceHeight: 360,
  })
  // A smooth synthetic gradient, never a camera picture.
  const camera = Buffer.from(
    Array.from({ length: 480 * 360 * 3 }, (_, index) =>
      Math.floor((index % (480 * 3)) / 6),
    ),
  )
  const { pixels, body } = await composeCameraFrame({
    layout,
    camera,
    label: "Door",
    status: "Live",
    time: "3:42:15 PM",
    renderText: blankText,
    codec: "jpeg",
  })
  const metadata = await sharp(body).metadata()
  expect(metadata.format).toBe("jpeg")
  expect(metadata.isProgressive).toBe(false)
  expect([metadata.width, metadata.height]).toEqual([
    480, 360,
  ])
  // Lossy, but every pixel of the decoded patch stays near the RGB565 frame.
  const decoded = await sharp(body).raw().toBuffer()
  const expected = cropRgb565({
    pixels,
    width: 480,
    rectangle: layout.patch,
  })
  const errors = Array.from(
    { length: 480 * 360 },
    (_, index) => {
      const value = expected.readUInt16BE(index * 2)
      const red = ((value >> 11) & 31) << 3
      return Math.abs(red - (decoded[index * 3] ?? 0))
    },
  )
  expect(
    errors.reduce((sum, error) => sum + error, 0) /
      errors.length,
  ).toBeLessThan(6)
  // The whole frame stays RGB565 for the worker's own bookkeeping.
  expect(pixels.length).toBe(480 * 480 * 2)
})
