import type { PreviewProfile } from "@castkit/shared/panels/previewProfile"
import { useEffect, useRef, useState } from "react"
import type { PreviewSize } from "./PreviewSizing.tsx"
import { usePreviewVisibility } from "./usePreviewVisibility.ts"

/** Render live data at the requested CSS dimensions; scaling only fits the preview into its card. */
export const LivePreviewFrame = ({
  url,
  name,
  size,
  profile,
  revision = 0,
  isThumbnail = false,
  onResize,
}: {
  url: string
  name: string
  size: PreviewSize
  profile?: PreviewProfile
  revision?: number
  isThumbnail?: boolean
  onResize?: (size: Exclude<PreviewSize, null>) => void
}) => {
  const container = useRef<HTMLDivElement>(null)
  const [availableWidth, setAvailableWidth] = useState(0)
  const isVisible = usePreviewVisibility(container)
  useEffect(() => {
    if (!container.current) return
    const observer = new ResizeObserver(([entry]) =>
      setAvailableWidth(entry?.contentRect.width ?? 0),
    )
    observer.observe(container.current)
    return () => observer.disconnect()
  }, [])
  const [imageUrl, setImageUrl] = useState<string | null>(
    null,
  )
  const [imageSize, setImageSize] =
    useState<PreviewSize>(null)
  const [message, setMessage] = useState("")
  const segments = url.split("/")
  const kind = segments[1]
  const viewId = decodeURIComponent(segments[2] ?? "")
  const incompatibility =
    kind === "view"
      ? profile?.unsupportedViews[viewId]?.join(" ")
      : undefined
  const imageEndpoint =
    profile?.delivery === "image"
      ? `/api/manage/previews/${encodeURIComponent(profile.deviceId)}/${kind}/${encodeURIComponent(viewId)}?revision=${revision}`
      : null
  useEffect(() => {
    setImageUrl(null)
    setImageSize(null)
    setMessage("")
    if (!imageEndpoint || !isVisible || incompatibility)
      return
    const controller = new AbortController()
    const resource = { url: "" }
    void fetch(imageEndpoint, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const result = await response
            .json()
            .catch(() => ({}))
          throw new Error(
            result.error ??
              "The image preview is unavailable.",
          )
        }
        const blob = await response.blob()
        if (controller.signal.aborted) return
        resource.url = URL.createObjectURL(blob)
        setImageUrl(resource.url)
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setMessage(
            error instanceof Error
              ? error.message
              : "The image preview is unavailable.",
          )
      })
    return () => {
      controller.abort()
      if (resource.url) URL.revokeObjectURL(resource.url)
    }
  }, [imageEndpoint, isVisible, incompatibility])
  const width =
    imageSize?.width ??
    size?.width ??
    (isThumbnail ? 1280 : Math.max(120, availableWidth))
  const height =
    imageSize?.height ??
    size?.height ??
    (isThumbnail ? 720 : 600)
  const scale = Math.min(
    1,
    availableWidth / width,
    (isThumbnail ? 230 : 650) / height,
  )
  const drag = useRef<{
    horizontal: number
    vertical: number
    width: number
    height: number
    scale: number
  } | null>(null)
  return (
    <div
      className={`live-preview${isThumbnail ? " live-preview-thumbnail" : ""}`}
      ref={container}
    >
      {incompatibility || message ? (
        <p className="text-content-secondary text-sm">
          {incompatibility
            ? `Unavailable on this profile: ${incompatibility}`
            : message}
        </p>
      ) : (
        <div
          className="live-preview-viewport"
          style={{
            inlineSize: width * scale,
            blockSize: height * scale,
          }}
        >
          {imageEndpoint ? (
            imageUrl ? (
              <img
                src={imageUrl}
                alt={`${name} rendered preview`}
                onLoad={(event) =>
                  setImageSize({
                    width: event.currentTarget.naturalWidth,
                    height:
                      event.currentTarget.naturalHeight,
                  })
                }
              />
            ) : (
              <p className="text-content-secondary text-sm">
                {isVisible
                  ? "Rendering preview…"
                  : "Preview paused"}
              </p>
            )
          ) : isVisible && availableWidth > 0 ? (
            <iframe
              key={`${url}:${revision}`}
              src={`${url}?preview=1${profile ? `&device=${encodeURIComponent(profile.deviceId)}` : ""}`}
              title={`${name} preview`}
              className="collection-preview-frame"
              inert={isThumbnail ? true : undefined}
              tabIndex={isThumbnail ? -1 : undefined}
              style={{
                width,
                height,
                transform: `scale(${scale})`,
                pointerEvents: isThumbnail
                  ? "none"
                  : undefined,
              }}
            />
          ) : (
            <p className="text-content-secondary text-sm">
              Preview paused
            </p>
          )}
        </div>
      )}
      {!isThumbnail ? (
        <p className="text-content-secondary text-xs">
          {Math.round(width)} × {Math.round(height)}{" "}
          {imageEndpoint ? "image" : "CSS"}
          pixels · {Math.round(scale * 100)}% display scale
        </p>
      ) : null}
      {onResize ? (
        <button
          className="preview-resize-handle"
          type="button"
          aria-label="Resize preview"
          title="Drag to resize; arrow keys change the size"
          onPointerDown={(event) => {
            event.preventDefault()
            event.currentTarget.setPointerCapture(
              event.pointerId,
            )
            drag.current = {
              horizontal: event.clientX,
              vertical: event.clientY,
              width,
              height,
              scale: Math.max(0.05, scale),
            }
          }}
          onPointerMove={(event) => {
            const start = drag.current
            if (start)
              onResize({
                width:
                  start.width +
                  (event.clientX - start.horizontal) /
                    start.scale,
                height:
                  start.height +
                  (event.clientY - start.vertical) /
                    start.scale,
              })
          }}
          onPointerUp={() => {
            drag.current = null
          }}
          onPointerCancel={() => {
            drag.current = null
          }}
          onKeyDown={(event) => {
            const horizontal =
              event.key === "ArrowRight"
                ? 20
                : event.key === "ArrowLeft"
                  ? -20
                  : 0
            const vertical =
              event.key === "ArrowDown"
                ? 20
                : event.key === "ArrowUp"
                  ? -20
                  : 0
            if (horizontal || vertical) {
              event.preventDefault()
              onResize({
                width: width + horizontal,
                height: height + vertical,
              })
            }
          }}
        >
          ↘
        </button>
      ) : null}
    </div>
  )
}
