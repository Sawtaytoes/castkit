/**
 * Cover-crop a photo to exact panel pixels, returning a `data:` URL.
 *
 * The server delivers every photo already cropped to the panel's precise
 * dimensions, and the browser preview should feed the views the same thing.
 * There is also a rasterizer reason: the foreignObject screenshotter that the
 * dither preview relies on mis-sizes a *scaled* `<img>` (natural pixels differ
 * from the CSS box), leaving a white margin down the right and bottom of the
 * dithered result. An image whose intrinsic size already equals the panel has
 * nothing to scale, so it rasterizes edge-to-edge.
 *
 * `cover` is the framing: fill the panel, centre-crop the overflow — matching
 * the photo adapter's fill mode.
 */

const dataUrlCache = new Map<string, Promise<string>>()

const loadImage = (imageUrl: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = "anonymous"
    image.onload = () => {
      resolve(image)
    }
    image.onerror = () => {
      reject(
        new Error(
          `coverCropPhoto: failed to load ${imageUrl}`,
        ),
      )
    }
    image.src = imageUrl
  })

export const coverCropToDataUrl = ({
  imageUrl,
  width,
  height,
}: {
  imageUrl: string
  width: number
  height: number
}) => {
  const cacheKey = `${imageUrl}@${width}x${height}`
  const cached = dataUrlCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const pending = loadImage(imageUrl).then((image) => {
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext("2d")
    if (!context) {
      throw new Error(
        "coverCropPhoto: could not get a 2D canvas context",
      )
    }

    const coverScale = Math.max(
      width / image.naturalWidth,
      height / image.naturalHeight,
    )
    const drawWidth = image.naturalWidth * coverScale
    const drawHeight = image.naturalHeight * coverScale
    const offsetLeft = (width - drawWidth) / 2
    const offsetTop = (height - drawHeight) / 2

    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = "high"
    context.drawImage(
      image,
      offsetLeft,
      offsetTop,
      drawWidth,
      drawHeight,
    )

    return canvas.toDataURL("image/png")
  })

  dataUrlCache.set(cacheKey, pending)
  return pending
}
