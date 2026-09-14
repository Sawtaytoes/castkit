type Channels = readonly [number, number, number]

/**
 * The relative luminance an accent must reach to stay legible as TYPE on the
 * panel's raised surface, per scheme. Both are the 4.5:1 solve against the
 * `--color-surface-raised` token, so they move if that token moves:
 *
 *   dark  surface #1D2430, luminance 0.0174 -> accent luminance >= 0.253
 *   light surface #FFFFFF, luminance 1.0000 -> accent luminance <= 0.183
 */
const MINIMUM_LUMINANCE_ON_DARK = 0.253
const MAXIMUM_LUMINANCE_ON_LIGHT = 0.183

const toLinear = (channel: number) => {
  const scaled = channel / 255
  return scaled <= 0.03928
    ? scaled / 12.92
    : ((scaled + 0.055) / 1.055) ** 2.4
}

const getRelativeLuminance = ([
  red,
  green,
  blue,
]: Channels) =>
  0.2126 * toLinear(red) +
  0.7152 * toLinear(green) +
  0.0722 * toLinear(blue)

/**
 * Blend a derived accent toward white (on dark) or black (on light) until it
 * clears the 4.5:1 floor against the surface it is painted on.
 *
 * Album art votes on HUE, and nothing in that vote is aware of the panel's
 * scheme. A cover whose dominant color is a deep navy used to be fine, because
 * the panel was light; with the panels defaulting to Dark that same navy is the
 * artist line and the progress fill rendered nearly invisible on a dark field.
 *
 * Luminance and not HSL lightness: lightness is not perceptual, so a pure blue
 * at 62% lightness still fails the contrast check while a yellow at the same
 * lightness passes by a wide margin. Blending preserves the hue the artwork
 * voted for, which is the part of the feature worth keeping.
 */
export const clampAccentToScheme = ({
  color,
  isDarkScheme,
}: {
  color: string
  isDarkScheme: boolean
}): string => {
  const parsed = color.match(/\d+(?:\.\d+)?/g)
  if (!parsed || parsed.length < 3) {
    return color
  }
  const channels = parsed
    .slice(0, 3)
    .map(Number) as unknown as Channels

  const isAcceptable = (candidate: Channels) =>
    isDarkScheme
      ? getRelativeLuminance(candidate) >=
        MINIMUM_LUMINANCE_ON_DARK
      : getRelativeLuminance(candidate) <=
        MAXIMUM_LUMINANCE_ON_LIGHT

  if (isAcceptable(channels)) {
    return `rgb(${channels[0]} ${channels[1]} ${channels[2]})`
  }

  const destination = isDarkScheme ? 255 : 0
  // 20 steps of 5%: the last one IS the destination, so this always terminates
  // on a value that clears the floor (white and black are the extremes).
  for (let step = 1; step <= 20; step += 1) {
    const ratio = step / 20
    const blended = channels.map((channel) =>
      Math.round(channel + (destination - channel) * ratio),
    ) as unknown as Channels
    if (isAcceptable(blended)) {
      return `rgb(${blended[0]} ${blended[1]} ${blended[2]})`
    }
  }
  return `rgb(${destination} ${destination} ${destination})`
}

/**
 * Derive an accent color from album art, client-side: downscale to 16×16 on
 * a canvas, bucket pixels by hue, and pick the most saturated-populous
 * bucket. ~1 KB instead of a color-extraction dependency.
 *
 * Artwork often comes from another origin without CORS headers — reading a
 * tainted canvas throws, so this resolves to null and the UI keeps the
 * neutral accent. Never applied on mono/grayscale panels (caller's job).
 */
export const extractAccentColor = (
  imageUrl: string,
): Promise<string | null> =>
  new Promise((resolvePromise) => {
    const image = new Image()
    image.crossOrigin = "anonymous"
    image.onerror = () => resolvePromise(null)
    image.onload = () => {
      try {
        const size = 16
        const canvas = document.createElement("canvas")
        canvas.width = size
        canvas.height = size
        const context = canvas.getContext("2d")
        if (!context) {
          resolvePromise(null)
          return
        }
        context.drawImage(image, 0, 0, size, size)
        const { data } = context.getImageData(
          0,
          0,
          size,
          size,
        )

        // Score each pixel by saturation×value; accumulate per hue bucket.
        const bucketCount = 12
        const scores = new Array<number>(bucketCount).fill(
          0,
        )
        const sums = Array.from(
          { length: bucketCount },
          () => ({ r: 0, g: 0, b: 0, weight: 0 }),
        )
        for (
          let index = 0;
          index < data.length;
          index += 4
        ) {
          const red = data[index]! / 255
          const green = data[index + 1]! / 255
          const blue = data[index + 2]! / 255
          const max = Math.max(red, green, blue)
          const min = Math.min(red, green, blue)
          const delta = max - min
          const saturation = max === 0 ? 0 : delta / max
          const score = saturation * max
          if (score < 0.15) {
            continue // Grays/near-blacks don't vote.
          }
          let hue = 0
          if (delta > 0) {
            if (max === red) {
              hue = ((green - blue) / delta) % 6
            } else if (max === green) {
              hue = (blue - red) / delta + 2
            } else {
              hue = (red - green) / delta + 4
            }
            hue = (hue * 60 + 360) % 360
          }
          const bucket = Math.floor(
            (hue / 360) * bucketCount,
          )
          scores[bucket]! += score
          const sum = sums[bucket]!
          sum.r += red * score
          sum.g += green * score
          sum.b += blue * score
          sum.weight += score
        }

        const bestBucket = scores.indexOf(
          Math.max(...scores),
        )
        const best = sums[bestBucket]
        if (!best || best.weight === 0) {
          resolvePromise(null)
          return
        }
        const toChannel = (value: number) =>
          Math.round((value / best.weight) * 255)
        resolvePromise(
          clampAccentToScheme({
            color: `rgb(${toChannel(best.r)} ${toChannel(best.g)} ${toChannel(best.b)})`,
            isDarkScheme:
              document.documentElement.dataset.scheme ===
              "dark",
          }),
        )
      } catch {
        resolvePromise(null) // Tainted canvas (no CORS) or decode failure.
      }
    }
    image.src = imageUrl
  })
