import { useEffect, useRef, useState } from "preact/hooks"
import { CameraHls } from "./CameraHls.tsx"
import { safeMediaUrl } from "./protocol.ts"

const CAMERA_CHECK_INTERVAL_MILLISECONDS = 5_000
const CAMERA_STALL_MILLISECONDS = 20_000
// Bambuddy retains an upstream camera for five seconds after its last viewer
// disconnects. A new request inside that window rejoins the same stale feed.
const CAMERA_RESTART_PAUSE_MILLISECONDS = 8_000
const CAMERA_SAMPLE_WIDTH = 256
const CAMERA_SAMPLE_HEIGHT = 144

type CameraProps = {
  url: string
  name: string
  isLive?: boolean
  format?: "hls" | "mjpeg"
  className?: string
}

/** Keep authenticated still and MJPEG cameras current. */
const MjpegCameraImage = ({
  url,
  name,
  isLive = false,
  className,
}: CameraProps) => {
  const image = useRef<HTMLImageElement>(null)
  const [frame, setFrame] = useState(0)
  const [hasFailed, setHasFailed] = useState(false)
  const [isRestarting, setIsRestarting] = useState(false)
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
    if (!isRestarting) {
      return
    }
    const timer = setTimeout(() => {
      setFrame((current) => current + 1)
      setIsRestarting(false)
    }, CAMERA_RESTART_PAUSE_MILLISECONDS)
    return () => clearTimeout(timer)
  }, [isRestarting])
  useEffect(() => {
    if (!isLive || isRestarting) {
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
      lastSignature: -1,
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
          const pixels = context.getImageData(
            0,
            0,
            CAMERA_SAMPLE_WIDTH,
            CAMERA_SAMPLE_HEIGHT,
          ).data
          const signature = pixels.reduce(
            (hash, value) =>
              Math.imul(hash ^ value, 16_777_619) >>> 0,
            2_166_136_261,
          )
          if (signature !== state.lastSignature) {
            state.lastSignature = signature
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
        setIsRestarting(true)
      }
    }, CAMERA_CHECK_INTERVAL_MILLISECONDS)
    return () => clearInterval(timer)
  }, [url, isLive, isRestarting])
  const source = safeMediaUrl(url)
  const refreshed =
    source && frame > 0
      ? `${source}${source.includes("?") ? "&" : "?"}frame=${frame}`
      : source
  return (
    <div
      class="platform-camera"
      data-failed={String(hasFailed)}
    >
      {isRestarting ? (
        <p role="status">Reconnecting {name} camera…</p>
      ) : (
        <img
          ref={image}
          class={className}
          src={refreshed}
          alt={`${name} camera`}
          onError={() => setHasFailed(true)}
          onLoad={() => setHasFailed(false)}
        />
      )}
      {hasFailed ? (
        <p role="status">{name} camera unavailable</p>
      ) : null}
    </div>
  )
}

/** Select the media player for the source's camera format. */
export const CameraImage = (props: CameraProps) =>
  props.format === "hls" ? (
    <CameraHls
      url={props.url}
      name={props.name}
      className={props.className}
    />
  ) : (
    <MjpegCameraImage {...props} />
  )
