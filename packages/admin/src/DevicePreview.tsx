import { Button, Card } from "@charcuterie/ui"
import { useEffect, useRef, useState } from "react"
import type { Device } from "./device.ts"

/** Preview saved output at the panel's real layout size, then scale it into the inspector. */
export const DevicePreview = ({
  device,
  apiToken,
  revision,
}: {
  device: Device | null
  apiToken: string
  revision: number
}) => {
  const frameRef = useRef<HTMLDivElement>(null)
  const [frameWidth, setFrameWidth] = useState(0)
  const [refresh, setRefresh] = useState(0)
  const [imageUrl, setImageUrl] = useState<string | null>(
    null,
  )
  const [message, setMessage] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const deviceId = device?.id
  const isBrowser = device?.renderer === "browser"

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) {
      return
    }
    const observer = new ResizeObserver(([entry]) =>
      setFrameWidth(entry?.contentRect.width ?? 0),
    )
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    setImageUrl(null)
    setMessage("")
    if (!deviceId || isBrowser) {
      setIsLoading(false)
      return
    }
    const controller = new AbortController()
    const resource: { url: string | null } = { url: null }
    setIsLoading(true)
    const loadImage = async () => {
      try {
        const response = await fetch(
          `/api/devices/${encodeURIComponent(deviceId)}/image?revision=${revision}&refresh=${refresh}`,
          {
            headers: apiToken
              ? { Authorization: `Bearer ${apiToken}` }
              : {},
            signal: controller.signal,
          },
        )
        if (!response.ok) {
          throw new Error(
            response.status === 401
              ? "Connect with an API token to load the image."
              : "The image is unavailable. Try Refresh.",
          )
        }
        const blob = await response.blob()
        if (controller.signal.aborted) {
          return
        }
        resource.url = URL.createObjectURL(blob)
        setImageUrl(resource.url)
      } catch (error) {
        if (!controller.signal.aborted) {
          setMessage(
            error instanceof Error
              ? error.message
              : "The image could not load.",
          )
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }
    void loadImage()
    return () => {
      controller.abort()
      if (resource.url) {
        URL.revokeObjectURL(resource.url)
      }
    }
  }, [apiToken, deviceId, isBrowser, refresh, revision])

  const panelWidth = Math.max(1, device?.width ?? 1)
  const panelHeight = Math.max(1, device?.height ?? 1)
  const scale = Math.min(1, frameWidth / panelWidth)
  return (
    <Card
      actions={
        device ? (
          <Button
            appearance="outline"
            isDisabled={isLoading}
            onClick={() =>
              setRefresh((current) => current + 1)
            }
            size="sm"
          >
            Refresh
          </Button>
        ) : null
      }
      className="device-preview"
      heading="Display preview"
    >
      <div className="preview-container" ref={frameRef}>
        {!device ? (
          <p className="preview-message">
            Save the new device to preview its output.
          </p>
        ) : isBrowser ? (
          <div
            className="browser-preview"
            style={{
              blockSize: panelHeight * scale,
              inlineSize: panelWidth * scale,
            }}
          >
            <iframe
              className="preview-iframe"
              height={panelHeight}
              inert
              key={`${device.id}-${refresh}-${revision}`}
              src={`/d/${encodeURIComponent(device.id)}?preview=1`}
              style={{ transform: `scale(${scale})` }}
              tabIndex={-1}
              title={`${device.label} browser preview`}
              width={panelWidth}
            />
          </div>
        ) : imageUrl ? (
          <img
            alt={`${device.label} rendered output`}
            className="image-preview"
            src={imageUrl}
          />
        ) : (
          <p
            aria-label="Image preview status"
            className="preview-message"
            role="status"
          >
            {isLoading ? "Render in progress…" : message}
          </p>
        )}
      </div>
      {device ? (
        <>
          <p className="text-content-secondary text-sm">
            {isBrowser
              ? "Live browser view. Preview controls are disabled."
              : "Rendered image from the saved settings. Refresh to update."}
          </p>
          <dl className="preview-facts">
            <dt>Resolution</dt>
            <dd>
              {device.width} × {device.height}
            </dd>
            <dt>Renderer</dt>
            <dd>{isBrowser ? "Browser" : "Image"}</dd>
            <dt>Rotation</dt>
            <dd>{device.rotation ?? 0}°</dd>
          </dl>
          <p className="text-content-secondary text-xs">
            This preview does not confirm what is on the
            physical screen.
          </p>
        </>
      ) : null}
    </Card>
  )
}
