import type { StreamFrameRequest } from "@castkit/render/engine"
import { readLocalDisplayTarget } from "@castkit/shared/views/localDisplayTarget"
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
    | "publicUrl"
    | "store"
    | "subscribe"
    | "screens"
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
            readLocalTarget: (viewId) => {
              const index = /^external-view:(\d+)$/.exec(
                viewId,
              )?.[1]
              const origin =
                platform.publicUrl ||
                `http://127.0.0.1:${port}`
              return index === undefined
                ? undefined
                : (readLocalDisplayTarget({
                    view: snapshot.device.externalViews[
                      Number(index)
                    ],
                    origin,
                    baseUrl: new URL(
                      `/d/${encodeURIComponent(deviceId)}`,
                      origin,
                    ).href,
                  }) ?? undefined)
            },
            readPlatformContent: (deviceTarget) => {
              const resolved = platform.getTarget({
                ...deviceTarget,
                deviceId,
              })
              // A separate capture context cannot inherit the worker's access session.
              const hasAdminControls =
                resolved?.view.isControlEnabled &&
                resolved.view.panels.some(
                  (panel) =>
                    panel.specId === "printer-status",
                )
              if (
                !resolved ||
                resolved.view.access === "pin" ||
                resolved.screen?.access === "pin" ||
                // A multi-view screen also draws inactive tabs and their activity.
                // Keep its worker capture until those dependencies have a cache key.
                (resolved.screen &&
                  resolved.screen.viewIds.length > 1) ||
                hasAdminControls
              ) {
                return undefined
              }
              return readPlatformTargetContent({
                platform,
                deviceId,
                deviceTarget,
                now: nowMs,
              })
            },
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
        if (!Array.isArray(read)) {
          // A frame the worker cannot map a touch onto is no frame at all.
          throw new Error(
            "The capture read no touch targets",
          )
        }
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
  const configuration = { value: platform.store.get() }
  const stopScreenChanges = platform.screens.subscribe(
    streamFrames.refreshAll,
  )
  const stopConfigurationChanges = platform.subscribe(
    () => {
      const next = platform.store.get()
      if (next !== configuration.value) {
        configuration.value = next
        streamFrames.refreshAll()
      } else {
        // Scan expiry and paused-music expiry notify without a store write.
        streamFrames.markAllChanged()
      }
    },
  )
  return {
    streamFrames,
    stop: () => {
      stopDeviceChanges()
      stopPlatformChanges()
      stopConfigurationChanges()
      stopScreenChanges()
      streamFrames.dispose()
    },
  }
}
