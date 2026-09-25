import { Button, Card, Picker } from "@charcuterie/ui"
import { useEffect, useRef, useState } from "react"
import type { Device } from "./device.ts"

/** Preview saved output at the panel's real layout size, then scale it into the inspector. */
export const DevicePreview = ({
  device,
  apiToken,
  revision,
  isOverview = false,
  onEdit,
  previewUrl,
}: {
  device: Device | null
  apiToken: string
  revision: number
  isOverview?: boolean
  onEdit?: () => void
  previewUrl?: string
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [orientation, setOrientation] = useState("upright")
  const [outputRotation, setOutputRotation] =
    useState<number>(device?.rotation ?? 0)
  const [imageSize, setImageSize] = useState({
    width: 0,
    height: 0,
  })
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
    const receiveOrientation = (event: MessageEvent) => {
      if (
        event.origin !== window.location.origin ||
        event.source !== iframeRef.current?.contentWindow
      ) {
        return
      }
      const data = event.data
      if (
        data?.type === "castkit-preview-orientation" &&
        data.deviceId === deviceId &&
        [0, 90, 180, 270].includes(data.orientation)
      ) {
        setOutputRotation(data.orientation)
      }
    }
    window.addEventListener("message", receiveOrientation)
    return () =>
      window.removeEventListener(
        "message",
        receiveOrientation,
      )
  }, [deviceId])

  useEffect(() => {
    setImageUrl(null)
    setMessage("")
    setImageSize({ width: 0, height: 0 })
    setOutputRotation(device?.rotation ?? 0)
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
        const rotationHeader = response.headers.get(
          "X-CastKit-Rotation",
        )
        const rotation =
          rotationHeader === null
            ? (device?.rotation ?? 0)
            : Number(rotationHeader)
        const blob = await response.blob()
        if (controller.signal.aborted) {
          return
        }
        setOutputRotation(
          [0, 90, 180, 270].includes(rotation)
            ? rotation
            : 0,
        )
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
  }, [
    apiToken,
    deviceId,
    device?.rotation,
    isBrowser,
    refresh,
    revision,
  ])

  const panelWidth = Math.max(
    1,
    isBrowser
      ? (device?.width ?? 1)
      : imageSize.width || device?.width || 1,
  )
  const panelHeight = Math.max(
    1,
    isBrowser
      ? (device?.height ?? 1)
      : imageSize.height || device?.height || 1,
  )
  const rotation =
    orientation === "upright" ? -outputRotation : 0
  const isSideways = Math.abs(rotation) % 180 === 90
  const displayWidth = isSideways ? panelHeight : panelWidth
  const displayHeight = isSideways
    ? panelWidth
    : panelHeight
  const scale = Math.min(
    1,
    frameWidth / displayWidth,
    (isOverview ? 216 : 420) / displayHeight,
  )
  const outputStyle = {
    width: panelWidth,
    height: panelHeight,
    transform: `translate(-50%, -50%) scale(${scale}) rotate(${rotation}deg)`,
  }
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
      heading={
        isOverview
          ? (device?.label ?? "Display")
          : "Display preview"
      }
    >
      {!isOverview && device ? (
        <Picker
          label="Preview orientation"
          value={orientation}
          onChange={setOrientation}
          options={[
            {
              label: "Normal orientation",
              value: "upright",
            },
            { label: "Device output", value: "output" },
          ]}
        />
      ) : null}
      <div className="preview-container" ref={frameRef}>
        {!device ? (
          <p className="preview-message">
            Save the new device to preview its output.
          </p>
        ) : isBrowser || imageUrl ? (
          <div
            className="preview-output"
            data-orientation={orientation}
            style={{
              blockSize: displayHeight * scale,
              inlineSize: displayWidth * scale,
            }}
          >
            {isBrowser ? (
              <iframe
                ref={iframeRef}
                className="preview-iframe"
                height={panelHeight}
                inert
                key={`${device.id}-${refresh}-${revision}`}
                src={
                  previewUrl ??
                  `/d/${encodeURIComponent(device.id)}?preview=1`
                }
                loading="lazy"
                style={outputStyle}
                tabIndex={-1}
                title={`${device.label} browser preview`}
                width={panelWidth}
              />
            ) : (
              <img
                alt={`${device.label} rendered output`}
                className="image-preview"
                onLoad={(event) =>
                  setImageSize({
                    width: event.currentTarget.naturalWidth,
                    height:
                      event.currentTarget.naturalHeight,
                  })
                }
                src={imageUrl ?? undefined}
                style={outputStyle}
              />
            )}
          </div>
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
          {!isOverview ? (
            <dl className="preview-facts">
              <dt>Resolution</dt>
              <dd>
                {device.width} × {device.height}
              </dd>
              <dt>Renderer</dt>
              <dd>{isBrowser ? "Browser" : "Image"}</dd>
              <dt>Rotation</dt>
              <dd>{outputRotation}°</dd>
            </dl>
          ) : null}
          {onEdit ? (
            <Button appearance="outline" onClick={onEdit}>
              Edit settings
            </Button>
          ) : null}
          {!isOverview ? (
            <p className="text-content-secondary text-xs">
              This preview does not confirm what is on the
              physical screen.
            </p>
          ) : null}
        </>
      ) : null}
    </Card>
  )
}
