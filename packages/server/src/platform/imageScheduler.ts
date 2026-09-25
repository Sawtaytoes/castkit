import { getPlatformDisplayCapabilities } from "./displayCompatibility.ts"
import type { Platform } from "./platform.ts"

type RenderState = {
  signature?: string
  viewId?: string
  lastRenderedAt: number
  isRendering: boolean
}
/** Coalesce channel updates into useful frames at each image display's repaint rate. */
export const createPlatformImageScheduler = ({
  platform,
  deviceIds,
  push,
}: {
  platform: Platform
  deviceIds: readonly string[]
  push: (deviceId: string) => Promise<boolean>
}) => {
  const states = new Map<string, RenderState>()
  const lifecycle = { isDisposed: false, isBusy: false }
  const tick = async () => {
    if (lifecycle.isDisposed || lifecycle.isBusy) return
    const candidate = deviceIds
      .map((deviceId) => {
        const screenId =
          platform.store.get().deviceScreens[deviceId]
        const target = screenId
          ? platform.getTarget({
              kind: "screen",
              id: screenId,
            })
          : null
        const display =
          platform.getDeviceProperties(deviceId)
        if (!target || !display) return null
        const capabilities =
          getPlatformDisplayCapabilities(display)
        const channels = platform.channelsForView(
          target.view,
        )
        const signature = JSON.stringify({
          view: target.view,
          photos: target.view.panels
            .filter(
              (panel) => panel.specId === "photo-frame",
            )
            .map((panel) =>
              Math.floor(
                Date.now() /
                  (Math.max(
                    5,
                    Number(
                      panel.settings.intervalSeconds ??
                        Number(
                          panel.settings
                            .photoIntervalMinutes ?? 5,
                        ) * 60,
                    ),
                  ) *
                    1000),
              ),
            ),
          channels: Object.values(channels).map(
            (channel) => ({
              id: channel.id,
              status: channel.status,
              data:
                channel.type === "time.v1"
                  ? Math.floor(Date.now() / 60000)
                  : channel.data,
            }),
          ),
          minute: target.view.panels.some((panel) =>
            ["clock", "ambient"].includes(panel.specId),
          )
            ? Math.floor(Date.now() / 60000)
            : undefined,
        })
        const state = states.get(deviceId) ?? {
          lastRenderedAt: 0,
          isRendering: false,
        }
        const hasChangedView =
          state.viewId !== target.view.id
        const isDue =
          Date.now() - state.lastRenderedAt >=
          Math.max(
            1000,
            capabilities.minimumValueLifetimeMilliseconds,
          )
        return signature !== state.signature &&
          (hasChangedView || isDue)
          ? {
              deviceId,
              signature,
              viewId: target.view.id,
              state,
            }
          : null
      })
      .find(Boolean)
    if (!candidate) return
    lifecycle.isBusy = true
    try {
      const isPushed = await push(candidate.deviceId)
      states.set(candidate.deviceId, {
        signature: isPushed
          ? candidate.signature
          : undefined,
        viewId: candidate.viewId,
        lastRenderedAt: Date.now(),
        isRendering: false,
      })
    } catch (error) {
      states.set(candidate.deviceId, {
        ...candidate.state,
        viewId: candidate.viewId,
        lastRenderedAt: Date.now(),
      })
      console.warn(
        "[platform] Display frame failed",
        error instanceof Error
          ? error.message
          : "unknown error",
      )
    } finally {
      lifecycle.isBusy = false
    }
  }
  const timer = setInterval(() => {
    void tick()
  }, 1000)
  timer.unref()
  return {
    dispose: () => {
      lifecycle.isDisposed = true
      clearInterval(timer)
      states.clear()
    },
  }
}
