import type { ContractData } from "@castkit/sdk/contracts"
import { useEffect, useState } from "preact/hooks"
import { CameraImage } from "./CameraImage.tsx"
import { CameraSnapshot } from "./CameraSnapshot.tsx"
import { useDisplayProperties } from "./displayProperties.ts"

/** One camera fills a temporary view; panel capabilities choose its transport. */
export const CameraAlertView = ({
  data,
  settings,
  snapshots,
}: {
  data: ContractData["cameras.v1"]
  settings: Record<string, unknown>
  snapshots?: ContractData["cameras.v1"]
}) => {
  const { repaint, properties } = useDisplayProperties()
  const camera = data.cameras[0]
  const label = String(
    settings.label || camera?.name || "Camera",
  )
  const [isVideoReady, setIsVideoReady] = useState(false)
  const hasVideo =
    repaint === "instant" &&
    properties?.delivery !== "image" &&
    camera?.isLive === true
  useEffect(
    () => setIsVideoReady(false),
    [camera?.url, hasVideo],
  )
  if (!camera)
    return <p role="status">Camera unavailable</p>
  const snapshotUrl =
    snapshots?.cameras[0]?.url ??
    camera.snapshotUrl ??
    (!camera.isLive ? camera.url : "")
  return (
    <section class="camera-alert" aria-label={label}>
      <header>
        <strong>{label}</strong>
        <span>
          {hasVideo && isVideoReady ? "Live" : "Snapshots"}
        </span>
      </header>
      <div class="camera-alert-media">
        {snapshotUrl && (!hasVideo || !isVideoReady) ? (
          <CameraSnapshot
            url={snapshotUrl}
            name={label}
            intervalSeconds={
              Number(settings.snapshotIntervalSeconds) || 1
            }
            isSingleFrame={new URLSearchParams(
              location.search,
            ).has("capture")}
          />
        ) : !hasVideo ? (
          <p role="status">
            Camera snapshots are unavailable
          </p>
        ) : null}
        {hasVideo ? (
          <div
            class="camera-alert-video"
            data-ready={String(isVideoReady)}
            onLoadedDataCapture={() =>
              setIsVideoReady(true)
            }
          >
            <CameraImage
              url={camera.url}
              name={label}
              isLive
              format={camera.format}
              onPlaybackChange={setIsVideoReady}
            />
          </div>
        ) : null}
      </div>
    </section>
  )
}
