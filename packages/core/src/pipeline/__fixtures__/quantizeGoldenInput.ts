/**
 * The input images for the quantizer's golden test, built from a seeded
 * generator so they are the same on every machine. Each mixes what the panels
 * are sent — a color gradient (top third), near-neutral grays like
 * anti-aliased text (middle third), and saturated noise with some translucent
 * pixels (bottom third).
 *
 * The small image's output is kept pixel by pixel, so a failure shows WHERE it
 * moved. The large one is kept as a checksum: some drift — summing the error
 * in single precision, say — moves no pixel of a 24×18 image and hundreds of a
 * 96×72 one.
 */
export const GOLDEN_SMALL_SIZE = { width: 24, height: 18 } as const
export const GOLDEN_LARGE_SIZE = { width: 96, height: 72 } as const

/** mulberry32: a small seeded generator, so the noise never changes. */
const createSeededRandom = (seed: number) => {
  let state = seed

  return () => {
    state = (state + 0x6d2b79f5) | 0
    let mixed = Math.imul(state ^ (state >>> 15), state | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)

    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

export const buildGoldenPixels = ({
  width,
  height,
}: {
  width: number
  height: number
}) => {
  const random = createSeededRandom(20261013)
  const pixels = new Uint8ClampedArray(width * height * 4)
  const bandHeight = height / 3

  for (let rowIndex = 0; rowIndex < height; rowIndex += 1) {
    for (
      let columnIndex = 0;
      columnIndex < width;
      columnIndex += 1
    ) {
      const byteOffset = (rowIndex * width + columnIndex) * 4
      const horizontal = columnIndex / (width - 1)
      const vertical = rowIndex / (height - 1)

      if (rowIndex < bandHeight) {
        pixels[byteOffset] = horizontal * 255
        pixels[byteOffset + 1] = vertical * 3 * 255
        pixels[byteOffset + 2] = (1 - horizontal) * 255
        pixels[byteOffset + 3] = 255
      } else if (rowIndex < bandHeight * 2) {
        const gray = horizontal * 255
        pixels[byteOffset] = gray + (random() - 0.5) * 40
        pixels[byteOffset + 1] = gray + (random() - 0.5) * 40
        pixels[byteOffset + 2] = gray + (random() - 0.5) * 40
        pixels[byteOffset + 3] = 255
      } else {
        pixels[byteOffset] = random() * 256
        pixels[byteOffset + 1] = random() * 256
        pixels[byteOffset + 2] = random() * 256
        pixels[byteOffset + 3] = random() < 0.2 ? random() * 256 : 255
      }
    }
  }

  return pixels
}
