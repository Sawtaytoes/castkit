import { useEffect, useRef, useState } from "preact/hooks"
import { safeMediaUrl } from "./protocol.ts"

const STALL_MILLISECONDS = 20_000
const RETRY_MILLISECONDS = 5_000

/** Play an authenticated CastKit HLS proxy without exposing HA credentials. */
export const CameraHls = ({
  url,
  name,
  className,
}: {
  url: string
  name: string
  className?: string
}) => {
  const video = useRef<HTMLVideoElement>(null)
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState("")
  useEffect(() => {
    const element = video.current
    const source = safeMediaUrl(url)
    if (!element || !source) return
    let isDisposed = false
    let player: import("hls.js").default | undefined
    let lastPosition = -1
    let lastAdvanceAt = Date.now()
    let retryTimer:
      | ReturnType<typeof setTimeout>
      | undefined
    const retry = () => {
      if (isDisposed || retryTimer) return
      setError(`Reconnecting ${name} camera…`)
      retryTimer = setTimeout(
        () => setAttempt((current) => current + 1),
        RETRY_MILLISECONDS,
      )
    }
    const monitor = setInterval(() => {
      if (element.currentTime > lastPosition) {
        lastPosition = element.currentTime
        lastAdvanceAt = Date.now()
        setError("")
      } else if (
        Date.now() - lastAdvanceAt >=
        STALL_MILLISECONDS
      ) {
        retry()
      }
    }, 5_000)
    const onError = () => retry()
    element.addEventListener("error", onError)
    void import("hls.js")
      .then(({ default: Hls }) => {
        if (isDisposed) return
        if (Hls.isSupported()) {
          player = new Hls({ lowLatencyMode: true })
          player.on(Hls.Events.ERROR, (_, detail) => {
            if (detail.fatal) retry()
          })
          player.on(Hls.Events.MANIFEST_PARSED, () => {
            void element.play().catch(retry)
          })
          player.loadSource(source)
          player.attachMedia(element)
        } else if (
          element.canPlayType(
            "application/vnd.apple.mpegurl",
          )
        ) {
          element.src = source
          void element.play().catch(retry)
        } else {
          setError(
            `${name} camera playback is unavailable in this browser.`,
          )
        }
      })
      .catch(retry)
    return () => {
      isDisposed = true
      clearInterval(monitor)
      if (retryTimer) clearTimeout(retryTimer)
      element.removeEventListener("error", onError)
      player?.destroy()
      element.pause()
      element.removeAttribute("src")
      element.load()
    }
  }, [url, name, attempt])
  return (
    <div class="platform-camera">
      <video
        ref={video}
        class={className}
        aria-label={`${name} camera`}
        autoplay
        muted
        playsInline
      />
      {error ? <p role="status">{error}</p> : null}
    </div>
  )
}
