import { useEffect, useState } from "preact/hooks"
import { safeMediaUrl } from "./protocol.ts"

/** Fetch only the newest image, with bounded requests and complete disposal. */
export const CameraSnapshot = ({
  url,
  name,
  intervalSeconds,
  isSingleFrame = false,
}: {
  url: string
  name: string
  intervalSeconds: number
  isSingleFrame?: boolean
}) => {
  const [frame, setFrame] = useState<{
    url: string
    acquiredAt: number
  } | null>(null)
  const [hasFailed, setHasFailed] = useState(false)
  useEffect(() => {
    const source = safeMediaUrl(url)
    const lifecycle = {
      isDisposed: false,
      controller: new AbortController(),
      nextTimer: undefined as
        | ReturnType<typeof setTimeout>
        | undefined,
      currentUrl: "",
    }
    setFrame(null)
    setHasFailed(!source)
    if (!source) return
    const interval =
      Math.min(10, Math.max(1, intervalSeconds || 1)) * 1000
    const refresh = async () => {
      const startedAt = Date.now()
      lifecycle.controller = new AbortController()
      const timeout = setTimeout(
        () => lifecycle.controller.abort(),
        3000,
      )
      try {
        const response = await fetch(source, {
          cache: "no-store",
          signal: lifecycle.controller.signal,
        })
        if (!response.ok)
          throw new Error("Camera unavailable")
        const blob = await response.blob()
        if (lifecycle.isDisposed) return
        const imageUrl = URL.createObjectURL(blob)
        const image = new Image()
        image.src = imageUrl
        try {
          await image.decode()
        } catch {
          URL.revokeObjectURL(imageUrl)
          throw new Error("Camera image unavailable")
        }
        if (
          lifecycle.isDisposed ||
          lifecycle.controller.signal.aborted
        ) {
          URL.revokeObjectURL(imageUrl)
          return
        }
        const previousUrl = lifecycle.currentUrl
        lifecycle.currentUrl = imageUrl
        setFrame({ url: imageUrl, acquiredAt: Date.now() })
        setHasFailed(false)
        if (previousUrl) URL.revokeObjectURL(previousUrl)
      } catch {
        if (!lifecycle.isDisposed) setHasFailed(true)
      } finally {
        clearTimeout(timeout)
        if (
          !lifecycle.isDisposed &&
          (!isSingleFrame || !lifecycle.currentUrl)
        )
          lifecycle.nextTimer = setTimeout(
            () => void refresh(),
            Math.max(
              100,
              interval - (Date.now() - startedAt),
            ),
          )
      }
    }
    void refresh()
    return () => {
      lifecycle.isDisposed = true
      lifecycle.controller.abort()
      clearTimeout(lifecycle.nextTimer)
      if (lifecycle.currentUrl)
        URL.revokeObjectURL(lifecycle.currentUrl)
    }
  }, [url, intervalSeconds, isSingleFrame])
  return (
    <div
      class="camera-alert-snapshot"
      data-castkit-plugin-ready={String(
        Boolean(frame) || hasFailed,
      )}
    >
      {frame ? (
        <img src={frame.url} alt={`${name} camera`} />
      ) : null}
      <p class="camera-alert-freshness" role="status">
        {hasFailed
          ? `Camera unavailable. Retrying.${frame ? ` Last image received ${new Date(frame.acquiredAt).toLocaleTimeString()}` : ""}`
          : frame
            ? `Image received ${new Date(frame.acquiredAt).toLocaleTimeString()}`
            : "Loading camera…"}
      </p>
    </div>
  )
}
