import {
  type Context,
  domToCanvas,
} from "modern-screenshot"

type Mask = {
  width: number
  height: number
  pixels: Set<number>
}
const glyphMask = (image: ImageData): Mask => {
  const points: [number, number][] = []
  let left = image.width,
    top = image.height,
    right = -1,
    bottom = -1
  for (let row = 0; row < image.height; row++)
    for (let column = 0; column < image.width; column++) {
      const offset = (row * image.width + column) * 4
      if (
        image.data[offset + 3]! > 128 &&
        image.data[offset]! < 128 &&
        image.data[offset + 1]! < 128 &&
        image.data[offset + 2]! < 128
      ) {
        points.push([column, row])
        left = Math.min(left, column)
        top = Math.min(top, row)
        right = Math.max(right, column)
        bottom = Math.max(bottom, row)
      }
    }
  const width = Math.max(0, right - left + 1),
    height = Math.max(0, bottom - top + 1)
  return {
    width,
    height,
    pixels: new Set(
      points.map(
        ([column, row]) =>
          (row - top) * width + column - left,
      ),
    ),
  }
}
/** Match actual glyph shapes, allowing one pixel of subpixel rasterization drift. */
const matchesGlyph = (actual: Mask, expected: Mask) => {
  if (
    !actual.pixels.size ||
    !expected.pixels.size ||
    Math.abs(actual.width - expected.width) > 2 ||
    Math.abs(actual.height - expected.height) > 2
  )
    return false
  const contains = (source: Mask, target: Mask) => {
    let missing = 0
    for (const point of source.pixels) {
      const column = point % source.width,
        row = Math.floor(point / source.width)
      let isFound = false
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const tx = column + dx,
            ty = row + dy
          if (
            tx >= 0 &&
            tx < target.width &&
            ty >= 0 &&
            ty < target.height &&
            target.pixels.has(ty * target.width + tx)
          )
            isFound = true
        }
      if (!isFound) missing++
    }
    return missing / source.pixels.size < 0.02
  }
  return (
    contains(actual, expected) && contains(expected, actual)
  )
}

/** Embedded SVG fonts can still be blank after decoding; verify their shapes before export. */
export const renderFontReadySvg = async ({
  svg,
  context,
  width,
  height,
}: {
  svg: SVGElement
  context: Context<Node>
  width: number
  height: number
}) => {
  const scale = context.scale,
    rowHeight = 24,
    probeWidth = Math.min(64, width)
  const fonts = [
    {
      family: "Atkinson Hyperlegible",
      weight: 400,
      text: "W",
    },
    {
      family: "Atkinson Hyperlegible",
      weight: 700,
      text: "W",
    },
    { family: "Noto Sans JP", weight: 400, text: "あ" },
    { family: "Noto Sans JP", weight: 700, text: "あ" },
  ]
  const reference = document.createElement("canvas")
  reference.width = Math.round(probeWidth * scale)
  reference.height = Math.round(40 * scale)
  const referenceContext = reference.getContext("2d", {
    willReadFrequently: true,
  })
  if (!referenceContext)
    throw new Error(
      "Panel font verification needs a 2D canvas",
    )
  const expected = fonts.map((font) => {
    referenceContext.fillStyle = "white"
    referenceContext.fillRect(
      0,
      0,
      reference.width,
      reference.height,
    )
    referenceContext.fillStyle = "black"
    referenceContext.font = `${font.weight} ${20 * scale}px '${font.family}'`
    referenceContext.fontKerning = "none"
    referenceContext.fillText(
      font.text,
      2 * scale,
      30 * scale,
    )
    return glyphMask(
      referenceContext.getImageData(
        0,
        0,
        reference.width,
        reference.height,
      ),
    )
  })
  const fullHeight = height + rowHeight * fonts.length
  const foreignObject = svg.querySelector("foreignObject")
  if (!foreignObject)
    throw new Error("Panel SVG needs a foreignObject")
  // The source node has fixed panel dimensions. Probes share its font rendering
  // path below the exported rectangle, without changing the panel's layout.
  foreignObject.setAttribute("height", String(fullHeight))
  svg.setAttribute("height", String(fullHeight))
  svg.setAttribute("viewBox", `0 0 ${width} ${fullHeight}`)
  const probes = document.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  )
  probes.setAttribute(
    "style",
    `position:absolute;left:0;top:${height}px;width:${probeWidth}px;height:${rowHeight * fonts.length}px;color:black;background:white`,
  )
  for (const font of fonts) {
    const text = document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    )
    text.setAttribute(
      "style",
      `height:${rowHeight}px;font-family:'${font.family}';font-size:20px;line-height:${rowHeight}px;font-weight:${font.weight};font-kerning:none;text-indent:2px;white-space:pre;color:black`,
    )
    text.textContent = font.text
    probes.append(text)
  }
  foreignObject.append(probes)
  const redrawCount = context.drawImageCount
  context.node = svg
  context.width = width
  context.height = fullHeight
  const deadline = performance.now() + 5_000
  const beforeDeadline = async <T>(pending: Promise<T>) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        pending,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  "Embedded panel fonts did not paint before the rasterization deadline",
                ),
              ),
            Math.max(0, deadline - performance.now()),
          )
        }),
      ])
    } finally {
      clearTimeout(timer)
    }
  }
  while (true) {
    // Keep the library's serializer sanitation, decoding, and Safari/Firefox
    // photo-redraw workaround; only font readiness is added here.
    context.drawImageCount = redrawCount
    const canvas = await beforeDeadline(
      domToCanvas(context),
    )
    const pixels = canvas.getContext("2d", {
      willReadFrequently: true,
    })
    if (!pixels)
      throw new Error(
        "Panel rasterization needs a 2D canvas",
      )
    if (
      expected.every((mask, index) =>
        matchesGlyph(
          glyphMask(
            pixels.getImageData(
              0,
              Math.round(
                (height + index * rowHeight) * scale,
              ),
              Math.round(probeWidth * scale),
              Math.round(rowHeight * scale),
            ),
          ),
          mask,
        ),
      )
    )
      return canvas
    let frame = 0
    try {
      await beforeDeadline(
        new Promise<void>((resolve) => {
          frame = requestAnimationFrame(() => resolve())
        }),
      )
    } finally {
      cancelAnimationFrame(frame)
    }
  }
}
