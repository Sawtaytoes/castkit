import type { ViewDefinition } from "@castkit/sdk/contracts"
import type { Context } from "hono"
import type {
  CameraAsset,
  CameraFrameService,
} from "./cameraFrameService.ts"

type CameraEntry = {
  name?: unknown
  url?: unknown
  snapshotUrl?: unknown
  format?: unknown
}

const MAXIMUM_SIDE = 1280
const MINIMUM_SIDE = 64

/** The channel asset a platform media URL names, as the source adapter published it. */
export const readMediaAsset = (
  url: unknown,
): CameraAsset | undefined => {
  if (typeof url !== "string") return undefined
  // A source publishes `/channels/<channel>/media/<asset>`; a display sees
  // the same asset as `/media/<channel>/<asset>`.
  const match =
    /\/channels\/([^/?]+)\/media\/([^/?]+)(?:\?|$)/.exec(
      url,
    ) ?? /\/media\/([^/?]+)\/([^/?]+)(?:\?|$)/.exec(url)
  if (!match?.[1] || !match[2]) return undefined
  try {
    return {
      channelId: decodeURIComponent(match[1]),
      assetId: decodeURIComponent(match[2]),
    }
  } catch {
    return undefined
  }
}

const readSide = (value: string | undefined) => {
  const side = Number(value)
  return Number.isInteger(side) &&
    side >= MINIMUM_SIDE &&
    side <= MAXIMUM_SIDE
    ? side
    : undefined
}

const firstCamera = (
  data: unknown,
): CameraEntry | undefined => {
  const cameras = (
    data as { cameras?: unknown } | undefined
  )?.cameras
  return Array.isArray(cameras)
    ? (cameras[0] as CameraEntry | undefined)
    : undefined
}

/**
 * Answer one long-poll for a camera alert's finished panel frames.
 *
 * The caller has already authorized the display and checked that the channel
 * belongs to it. The camera alert panel names everything else: its video
 * channel, its stills channel and its label. The body is the whole frame
 * (big-endian RGB565, `width` x `height`) followed by the zlib patch body;
 * headers say where one ends and what the patch covers. 204 means no newer
 * picture arrived in time; ask again.
 */
export const sendCameraFrame = async ({
  context,
  view,
  channelId,
  assetId,
  readChannelData,
  service,
}: {
  context: Context
  view: ViewDefinition
  channelId: string
  assetId: string
  readChannelData: (channelId: string) => unknown
  service: CameraFrameService
}) => {
  const panel = view.panels.find(
    (item) =>
      item.specId === "camera-alert" &&
      item.bindings.data === channelId,
  )
  const width = readSide(context.req.query("width"))
  const height = readSide(context.req.query("height"))
  if (!panel || !width || !height)
    return context.json(
      { error: "No camera frames for this request" },
      404,
    )
  const camera = firstCamera(readChannelData(channelId))
  const snapshotsChannelId = panel.bindings.snapshots
  const snapshotAsset = snapshotsChannelId
    ? readMediaAsset(
        firstCamera(readChannelData(snapshotsChannelId))
          ?.url,
      )
    : undefined
  const isVideo = camera?.format === "hls"
  const source = {
    ...(isVideo ? { video: { channelId, assetId } } : {}),
    still:
      snapshotAsset ??
      (isVideo
        ? readMediaAsset(camera?.snapshotUrl)
        : { channelId, assetId }),
  }
  const label = String(
    panel.settings.label ||
      (typeof camera?.name === "string"
        ? camera.name
        : "") ||
      "Camera",
  ).slice(0, 48)
  const after = Number(context.req.query("after") ?? 0)
  const frame = await service.waitForFrame({
    source,
    width,
    height,
    label,
    after: Number.isFinite(after) ? after : 0,
    timeoutMilliseconds: 5000,
    signal: context.req.raw.signal,
  })
  if (!frame) {
    return context.body(null, 204, {
      "cache-control": "no-store",
    })
  }
  return new Response(
    Buffer.concat([frame.pixels, frame.body]),
    {
      headers: {
        "content-type": "application/octet-stream",
        "cache-control": "private, no-store",
        "x-castkit-frame-sequence": String(frame.sequence),
        "x-castkit-frame-pixels": String(
          frame.pixels.length,
        ),
        "x-castkit-frame-patch": [
          frame.patch.x,
          frame.patch.y,
          frame.patch.width,
          frame.patch.height,
        ].join(","),
        "x-castkit-frame-codec": "zlib",
        "x-castkit-frame-layout": frame.layout,
        "x-castkit-frame-origin": frame.origin,
        "x-castkit-frame-received-at": String(
          frame.receivedAt,
        ),
      },
    },
  )
}
