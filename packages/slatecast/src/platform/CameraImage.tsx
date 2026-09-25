import { useEffect, useState } from "preact/hooks"
import { safeMediaUrl } from "./protocol.ts"

/** Refresh authenticated still cameras without exposing upstream credentials. */
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
  const source = safeMediaUrl(url)
  const refreshed =
    source && frame > 0
      ? `${source}${source.includes("?") ? "&" : "?"}frame=${frame}`
      : source
  return (
    <div class="platform-camera">
      <img
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
