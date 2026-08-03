import { domToCanvas } from "modern-screenshot"
import {
  installPanelFonts,
  loadPanelFontFaceDataUriCss,
} from "./panelFontFaceCss.ts"

/**
 * Turn a live panel DOM node into the native-resolution RGBA pixels the
 * quantizer expects, the way the server does it: draw at
 * `supersampleFactor × native`, then downscale to native so anti-aliasing is
 * baked into the pixels *before* they are quantized. That order is the whole
 * reason supersampling exists in this pipeline.
 *
 * Two honest caveats, both by design:
 *
 * - The downscale is canvas bilinear, not sharp's Lanczos3. Moving the
 *   supersample slider shows a real difference at each factor, but not
 *   byte-identically the device's. Hand-rolling Lanczos here would mean two
 *   independent resamplers to keep in step — exactly the drift the shared
 *   quantizer exists to prevent.
 * - `modern-screenshot` re-renders the DOM inside an SVG `foreignObject`, so
 *   subpixel text positioning can differ slightly from Chromium's
 *   `page.screenshot`. This is a comparison tool, not a device simulator.
 *   Do not build a visual-regression gate on it.
 *
 * The node passed in MUST be the un-zoomed 1:1 mount. Rasterizing a
 * CSS-scaled node bakes the zoom into the pixels and the dither would be of
 * the wrong image entirely.
 */
export const rasterizePanel = async ({
  node,
  width,
  height,
  supersampleFactor,
}: {
  node: HTMLElement
  width: number
  height: number
  supersampleFactor: number
}) => {
  // A foreignObject SVG cannot fetch subresources, so the faces must be inline
  // and loaded — otherwise the raster silently captures fallback-font metrics.
  await installPanelFonts()
  const fontEmbedCss = await loadPanelFontFaceDataUriCss()

  // Any photo is cropped to the panel size asynchronously; rasterizing before it
  // decodes would capture a blank or half-loaded image. Wait for every `<img>`.
  await Promise.all(
    Array.from(node.querySelectorAll("img")).map((image) =>
      image.complete && image.naturalWidth > 0
        ? Promise.resolve()
        : image.decode().catch(() => undefined),
    ),
  )

  // Only `scale` — NOT `width`/`height`. Passing an explicit size makes the
  // rasterizer lay the clone out in a larger box than the node and pin the
  // content top-left, so the render comes back with a white margin down the
  // right and bottom. Deriving the size from the node's own box avoids that.
  const supersampledCanvas = await domToCanvas(node, {
    scale: supersampleFactor,
    backgroundColor: "#ffffff",
    font: { cssText: fontEmbedCss },
  })

  const nativeCanvas = document.createElement("canvas")
  nativeCanvas.width = width
  nativeCanvas.height = height

  const context = nativeCanvas.getContext("2d", {
    willReadFrequently: true,
  })
  if (!context) {
    throw new Error(
      "rasterizePanel: could not get a 2D canvas context",
    )
  }

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = "high"
  // The rasterizer's canvas can be LARGER than `width × scale` — it pads the
  // right and bottom — with the real content pinned to the top-left at exactly
  // native × scale. Downscaling the whole canvas would shrink that content and
  // leave a white gap down those two edges, so sample only the content box.
  context.drawImage(
    supersampledCanvas,
    0,
    0,
    width * supersampleFactor,
    height * supersampleFactor,
    0,
    0,
    width,
    height,
  )

  return context.getImageData(0, 0, width, height)
}

/** Paint quantized RGBA pixels into a canvas at native size. */
export const paintPixelsToCanvas = ({
  canvas,
  pixels,
  width,
  height,
}: {
  canvas: HTMLCanvasElement
  pixels: Uint8ClampedArray
  width: number
  height: number
}) => {
  const context = canvas.getContext("2d")
  if (!context) {
    throw new Error(
      "paintPixelsToCanvas: could not get a 2D canvas context",
    )
  }
  context.putImageData(
    new ImageData(
      new Uint8ClampedArray(pixels),
      width,
      height,
    ),
    0,
    0,
  )
}
