import { promisify } from "node:util"
import { deflate } from "node:zlib"
import sharp from "sharp"

const deflateAsync = promisify(deflate)

/** A rectangle in panel pixels. */
export type FrameRectangle = {
  x: number
  y: number
  width: number
  height: number
}

/**
 * How a patch body is compressed: `zlib` of big-endian RGB565, which every
 * image-stream board draws, or baseline `jpeg` of the patch, for a board that
 * reports it can decode one (a camera picture is about a fifth of the bytes).
 */
export type PatchCodec = "zlib" | "jpeg"

/** JPEG quality for camera patches; the picture is a moving camera, not text. */
export const CAMERA_JPEG_QUALITY = 75

/** A text coverage mask, 0 = background and 255 = solid glyph. */
export type TextMask = {
  width: number
  height: number
  coverage: Uint8Array
}

export type RenderTextMask = (request: {
  text: string
  width: number
  height: number
  fontSize: number
  align?: "start" | "end"
}) => TextMask

/** A band shorter than this cannot carry a readable label. */
const MINIMUM_BAND_HEIGHT = 48

/**
 * Where the camera goes on one panel profile.
 *
 * The picture keeps its aspect and fits the panel. When the space left above
 * and below it can hold a label band (4:3 in a 480x480 square leaves 60 px each
 * side), the label sits in the top band and the patch a panel redraws per
 * picture is the camera rectangle alone. Otherwise (480x320 landscape) the label
 * and time lie on the picture and every picture redraws the whole panel.
 */
export const getCameraFrameLayout = ({
  width,
  height,
  sourceWidth,
  sourceHeight,
}: {
  width: number
  height: number
  sourceWidth: number
  sourceHeight: number
}) => {
  const scale = Math.min(
    width / sourceWidth,
    height / sourceHeight,
  )
  const cameraWidth = Math.min(
    width,
    Math.max(2, Math.round(sourceWidth * scale)),
  )
  const cameraHeight = Math.min(
    height,
    Math.max(2, Math.round(sourceHeight * scale)),
  )
  const spare = height - cameraHeight
  const hasBands = spare >= MINIMUM_BAND_HEIGHT * 2
  const camera = {
    x: Math.floor((width - cameraWidth) / 2),
    y: Math.floor(spare / 2),
    width: cameraWidth,
    height: cameraHeight,
  }
  return {
    width,
    height,
    camera,
    header: hasBands
      ? { x: 0, y: 0, width, height: camera.y }
      : undefined,
    patch: hasBands
      ? camera
      : { x: 0, y: 0, width, height },
  }
}

export type CameraFrameLayout = ReturnType<
  typeof getCameraFrameLayout
>

const blendMask = ({
  canvas,
  canvasWidth,
  mask,
  x,
  y,
}: {
  canvas: Buffer
  canvasWidth: number
  mask: TextMask
  x: number
  y: number
}) => {
  mask.coverage.forEach((alpha, index) => {
    if (alpha === 0) return
    const offset =
      ((y + Math.floor(index / mask.width)) * canvasWidth +
        x +
        (index % mask.width)) *
      3
    if (offset < 0 || offset + 2 >= canvas.length) return
    ;[0, 1, 2].forEach((channel) => {
      const value = canvas[offset + channel] ?? 0
      canvas[offset + channel] = Math.round(
        value + ((255 - value) * alpha) / 255,
      )
    })
  })
}

const darken = ({
  canvas,
  canvasWidth,
  rectangle,
}: {
  canvas: Buffer
  canvasWidth: number
  rectangle: FrameRectangle
}) => {
  Array.from({ length: rectangle.height }).forEach(
    (_, row) => {
      const start =
        ((rectangle.y + row) * canvasWidth + rectangle.x) *
        3
      canvas
        .subarray(start, start + rectangle.width * 3)
        .forEach((value, index, line) => {
          line[index] = value >> 2
        })
    },
  )
}

/**
 * Big-endian RGB565, the byte order both image-stream panel kinds draw.
 *
 * Packs into a native-order `Uint16Array` and swaps the bytes once at the end:
 * about 3 ms for a 480x480 frame, against 11 ms writing each pixel through
 * `Buffer.writeUInt16BE`, which matters at ten pictures per second per profile.
 */
export const toRgb565 = (rgb: Buffer) => {
  const source = new Uint8Array(
    rgb.buffer,
    rgb.byteOffset,
    rgb.length,
  )
  const packed = new Uint16Array(rgb.length / 3)
  packed.forEach((_, index, pixels) => {
    const offset = index * 3
    pixels[index] =
      (((source[offset] ?? 0) & 0xf8) << 8) |
      (((source[offset + 1] ?? 0) & 0xfc) << 3) |
      ((source[offset + 2] ?? 0) >> 3)
  })
  return Buffer.from(packed.buffer).swap16()
}

/** Cut one rectangle out of a big-endian RGB565 panel frame. */
export const cropRgb565 = ({
  pixels,
  width,
  rectangle,
}: {
  pixels: Buffer
  width: number
  rectangle: FrameRectangle
}) =>
  rectangle.x === 0 && rectangle.width === width
    ? pixels.subarray(
        rectangle.y * width * 2,
        (rectangle.y + rectangle.height) * width * 2,
      )
    : Buffer.concat(
        Array.from({ length: rectangle.height }).map(
          (_, row) => {
            const start =
              ((rectangle.y + row) * width + rectangle.x) *
              2
            return pixels.subarray(
              start,
              start + rectangle.width * 2,
            )
          },
        ),
      )

/**
 * Compose one panel frame: the camera picture (already scaled to the layout's
 * camera rectangle), the label, and the truthful receipt time. Returns the
 * whole frame as big-endian RGB565 plus the patch rectangle's body in `codec`,
 * which every panel of this profile sends unchanged.
 */
export const composeCameraFrame = async ({
  layout,
  camera,
  label,
  status,
  time,
  renderText,
  codec = "zlib",
}: {
  layout: CameraFrameLayout
  camera: Buffer
  label: string
  status: string
  time: string
  renderText: RenderTextMask
  codec?: PatchCodec
}) => {
  const canvas = Buffer.alloc(
    layout.width * layout.height * 3,
  )
  Array.from({ length: layout.camera.height }).forEach(
    (_, row) => {
      camera.copy(
        canvas,
        ((layout.camera.y + row) * layout.width +
          layout.camera.x) *
          3,
        row * layout.camera.width * 3,
        (row + 1) * layout.camera.width * 3,
      )
    },
  )
  const timeMask = renderText({
    text: time,
    width: 132,
    height: 28,
    fontSize: 20,
    align: "end",
  })
  const timeBox = {
    x: layout.camera.x + layout.camera.width - 144,
    y: layout.camera.y + layout.camera.height - 36,
    width: 140,
    height: 32,
  }
  darken({
    canvas,
    canvasWidth: layout.width,
    rectangle: timeBox,
  })
  blendMask({
    canvas,
    canvasWidth: layout.width,
    mask: timeMask,
    x: timeBox.x + 4,
    y: timeBox.y + 2,
  })
  if (layout.header) {
    const labelMask = renderText({
      text: label,
      width: Math.floor(layout.width * 0.65),
      height: layout.header.height,
      fontSize: 30,
    })
    blendMask({
      canvas,
      canvasWidth: layout.width,
      mask: labelMask,
      x: 16,
      y: 0,
    })
    const statusMask = renderText({
      text: status,
      width: Math.floor(layout.width * 0.3),
      height: layout.header.height,
      fontSize: 22,
      align: "end",
    })
    blendMask({
      canvas,
      canvasWidth: layout.width,
      mask: statusMask,
      x: layout.width - 16 - statusMask.width,
      y: 0,
    })
  } else {
    const text = `${label} · ${status}`
    const labelBox = {
      x: layout.camera.x + 4,
      y: layout.camera.y + 4,
      width: Math.min(layout.camera.width - 8, 260),
      height: 36,
    }
    darken({
      canvas,
      canvasWidth: layout.width,
      rectangle: labelBox,
    })
    blendMask({
      canvas,
      canvasWidth: layout.width,
      mask: renderText({
        text,
        width: labelBox.width - 16,
        height: labelBox.height,
        fontSize: 22,
      }),
      x: labelBox.x + 8,
      y: labelBox.y,
    })
  }
  const pixels = toRgb565(canvas)
  const body =
    codec === "jpeg"
      ? await sharp(canvas, {
          raw: {
            width: layout.width,
            height: layout.height,
            channels: 3,
          },
        })
          .extract({
            left: layout.patch.x,
            top: layout.patch.y,
            width: layout.patch.width,
            height: layout.patch.height,
          })
          .jpeg({
            quality: CAMERA_JPEG_QUALITY,
            progressive: false,
            mozjpeg: false,
          })
          .toBuffer()
      : await deflateAsync(
          cropRgb565({
            pixels,
            width: layout.width,
            rectangle: layout.patch,
          }),
          { level: 1 },
        )
  return { pixels, body }
}
