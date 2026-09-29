import { useEffect, useRef, useState } from "preact/hooks"
import { safeMediaUrl } from "./protocol.ts"

const CAMERA_CHECK_INTERVAL_MILLISECONDS = 5_000
const CAMERA_STALL_MILLISECONDS = 20_000
const CAMERA_SAMPLE_WIDTH = 64
const CAMERA_SAMPLE_HEIGHT = 48

/** Keep authenticated still and live cameras current without exposing upstream credentials. */
export const CameraImage = ({
  url,
  name,
  isLive = false,
  className,
}: {
  url: string
  name: string
  isLive?: boolean
  className?: string
}) => {
  const image = useRef<HTMLImageElement>(null)
  const [frame, setFrame] = useState(0)
  const [hasFailed, setHasFailed] = useState(false)
  useEffect(() => {
    if (isLive) {
      return
    }
    const timer = setInterval(
      () => setFrame((current) => current + 1),
      10_000,
    )
    return () => clearInterval(timer)
  }, [url, isLive])
  useEffect(() => {
    if (!isLive || !hasFailed) return
    const timer = setTimeout(() => {
      setFrame((current) => current + 1)
      setHasFailed(false)
    }, 5_000)
    return () => clearTimeout(timer)
  }, [url, isLive, hasFailed])
  useEffect(() => {
    if (!isLive) {
      return
    }
    // A stalled MJPEG request can leave its last frame on screen without
    // firing an image error. Sample the pixels rather than the HTTP state.
    const canvas = document.createElement("canvas")
    canvas.width = CAMERA_SAMPLE_WIDTH
    canvas.height = CAMERA_SAMPLE_HEIGHT
    const context = canvas.getContext("2d", {
      willReadFrequently: true,
    })
    if (!context) {
      return
    }
    const state = {
      lastPixels: "",
      lastChangeAt: Date.now(),
    }
    const timer = setInterval(() => {
      const currentImage = image.current
      if (currentImage?.naturalWidth) {
        try {
          context.drawImage(
            currentImage,
            0,
            0,
            CAMERA_SAMPLE_WIDTH,
            CAMERA_SAMPLE_HEIGHT,
          )
          const pixels = context
            .getImageData(
              0,
              0,
              CAMERA_SAMPLE_WIDTH,
              CAMERA_SAMPLE_HEIGHT,
            )
            .data.join(",")
          if (pixels !== state.lastPixels) {
            state.lastPixels = pixels
            state.lastChangeAt = Date.now()
          }
        } catch {
          // A browser that cannot sample this image still gets the normal
          // image error retry below.
          state.lastChangeAt = Date.now()
        }
      }
      if (
        Date.now() - state.lastChangeAt >=
        CAMERA_STALL_MILLISECONDS
      ) {
        state.lastChangeAt = Date.now()
        setFrame((current) => current + 1)
      }
    }, CAMERA_CHECK_INTERVAL_MILLISECONDS)
    return () => clearInterval(timer)
  }, [url, isLive])
  const source = safeMediaUrl(url)
  const refreshed =
    source && frame > 0
      ? `${source}${source.includes("?") ? "&" : "?"}frame=${frame}`
      : source
  return (
    <div class="platform-camera">
      <img
        ref={image}
        class={className}
        src={refreshed}
        alt={`${name} camera`}
        onError={() => setHasFailed(true)}
        onLoad={() => setHasFailed(false)}
      />
      {hasFailed ? (
        <p role="status">{name} camera unavailable</p>
      ) : null}
    </div>
  )
}
