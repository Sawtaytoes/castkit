import type { StreamFrameRequest } from "@castkit/render/engine"
import type { Platform } from "../platform/platform.ts"
import { readPlatformTargetContent } from "../platform/platformFrameKey.ts"
import type { BrowserMode } from "./browserMode.ts"
import {
  createStreamFrameCache,
  readStreamDestinations,
  STREAM_TARGETS_SCRIPT,
  type StreamTarget,
} from "./streamFrames.ts"

/**
 * Each swipe destination of each image-stream panel whose worker is listening,
 * drawn ahead into memory in the worker's own browser context
 * (docs/2026-10-23-shared-frame-cache-plan.md, phase 2).
 *
 * A capture loads this server's own device page over loopback, from a
 * one-time token that names the exact snapshot the frame was keyed from.
 */
export const startStreamFrameService = ({
  browserMode,
  platform,
  captureStreamFrame,
  port,
  log = console,
}: {
  browserMode: Pick<
    BrowserMode,
    | "readDeviceSnapshot"
    | "readLearnedTarget"
    | "openCapture"
    | "onDeviceChange"
  >
  platform: Pick<
    Platform,
    | "getTarget"
    | "getDeviceProperties"
    | "channelsForView"
    | "hub"
  >
  captureStreamFrame: (
    request: StreamFrameRequest,
  ) => Promise<{ png: Buffer; read: unknown }>
  port: number
  log?: Pick<Console, "log" | "warn">
}) => {
  const streamFrames = createStreamFrameCache({
    readDestinations: (deviceId, nowMs) => {
      const snapshot =
        browserMode.readDeviceSnapshot(deviceId)
      return snapshot
        ? readStreamDestinations({
            snapshot,
            nowMs,
            readLearnedTarget: (requested) =>
              browserMode.readLearnedTarget(
                deviceId,
                requested,
              ),
            readPlatformContent: (deviceTarget) =>
              readPlatformTargetContent({
                platform,
                deviceId,
                deviceTarget,
                now: nowMs,
              }),
          })
        : undefined
    },
    capture: async ({ deviceId, destination }) => {
      const capture = browserMode.openCapture({
        deviceId,
        snapshot: destination.snapshot,
      })
      try {
        const { width, height } =
          destination.snapshot.device
        const { png, read } = await captureStreamFrame({
          url: `http://127.0.0.1:${port}/d/${encodeURIComponent(deviceId)}?capture=${capture.token}`,
          width,
          height,
          readScript: STREAM_TARGETS_SCRIPT,
          readArgument: {
            attribute: "data-castkit-target",
            loadingSelector: null,
            width,
            height,
          },
        })
        return { png, targets: read as StreamTarget[] }
      } finally {
        capture.close()
      }
    },
    onRendered: ({
      deviceId,
      viewId,
      milliseconds,
      bytes,
    }) => {
      log.log(
        `[castkit] stream frame ahead ${deviceId} ${viewId} (${milliseconds} ms, ${bytes} bytes)`,
      )
    },
    onFailed: ({ deviceId, viewId, error }) => {
      log.warn(
        `[castkit] stream frame ahead failed ${deviceId} ${viewId}: ${error instanceof Error ? error.message : String(error)}`,
      )
    },
  })
  const stopDeviceChanges = browserMode.onDeviceChange(
    streamFrames.markChanged,
  )
  const stopPlatformChanges = platform.hub.subscribe(
    (channel) => {
      streamFrames.markChannelChanged(channel.id)
    },
  )
  return {
    streamFrames,
    stop: () => {
      stopDeviceChanges()
      stopPlatformChanges()
      streamFrames.dispose()
    },
  }
}
