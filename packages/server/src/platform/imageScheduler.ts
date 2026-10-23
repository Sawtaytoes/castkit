import { getPlatformDisplayCapabilities } from "./displayCompatibility.ts"
import type { Platform } from "./platform.ts"

type RenderState = {
  signature?: string
  viewId?: string
  lastRenderedAt: number
  isRendering: boolean
}
type PrerenderState = {
  /** The key last seen, and when it was first seen: the settle timer. */
  key: string
  keySeenAt: number
  /** When the held frame first went stale: the longest a burst may defer it. */
  staleSince: number
  /** A key whose render failed is left to the request path until it changes. */
  failedKey?: string
}

/** A key that holds this long is a settled change worth one render. */
export const PRERENDER_SETTLE_MILLISECONDS = 2000
/** A display whose content keeps changing still gets a frame this often. */
export const PRERENDER_MAXIMUM_DEFER_MILLISECONDS = 10_000

/**
 * The displays that render only when they ask (`renderOn: "request"`). The
 * scheduler never pushes to them; it renders their frame AHEAD, into memory,
 * when what the frame is drawn from changes, so the request is answered from
 * the buffer.
 */
type RequestDisplays = {
  deviceIds: readonly string[]
  /** The key a render would produce now, or `undefined` when none is wanted. */
  getPrerenderKey: (deviceId: string) => string | undefined
  prerender: (deviceId: string) => Promise<boolean>
}

/** Coalesce channel updates into useful frames at each image display's repaint rate. */
export const createPlatformImageScheduler = ({
  platform,
  deviceIds,
  push,
  requestDisplays,
}: {
  platform: Platform
  deviceIds: readonly string[]
  push: (deviceId: string) => Promise<boolean>
  requestDisplays?: RequestDisplays
}) => {
  const states = new Map<string, RenderState>()
  const prerenderStates = new Map<string, PrerenderState>()
  const lifecycle = { isDisposed: false, isBusy: false }
  /**
   * The request display whose frame should be rendered ahead now: its key
   * changed, then held still for the settle time (or a burst outlasted the
   * longest deferral). Content changes, never the clock, start these renders.
   */
  const findPrerenderCandidate = () => {
    const now = Date.now()
    // `filter`, not `find`: every display's settle timer starts on the tick
    // its key changed, even when another display renders first.
    return requestDisplays?.deviceIds.filter((deviceId) => {
      const key = requestDisplays.getPrerenderKey(deviceId)
      if (key === undefined) {
        prerenderStates.delete(deviceId)
        return false
      }
      const previous = prerenderStates.get(deviceId)
      const state: PrerenderState =
        previous?.key === key
          ? previous
          : {
              key,
              keySeenAt: now,
              // A failed render starts a fresh burst rather than letting
              // the next key skip the settle time.
              staleSince:
                previous && previous.failedKey === undefined
                  ? previous.staleSince
                  : now,
              failedKey: previous?.failedKey,
            }
      prerenderStates.set(deviceId, state)
      return (
        state.failedKey !== key &&
        (now - state.keySeenAt >=
          PRERENDER_SETTLE_MILLISECONDS ||
          now - state.staleSince >=
            PRERENDER_MAXIMUM_DEFER_MILLISECONDS)
      )
    })[0]
  }
  const markFailed = (deviceId: string) => {
    const state = prerenderStates.get(deviceId)
    if (state) {
      prerenderStates.set(deviceId, {
        ...state,
        failedKey: state.key,
      })
    }
  }
  const prerender = async (deviceId: string) => {
    lifecycle.isBusy = true
    try {
      const isReady =
        (await requestDisplays?.prerender(deviceId)) ??
        false
      if (isReady) {
        prerenderStates.delete(deviceId)
      } else {
        markFailed(deviceId)
      }
    } catch (error) {
      markFailed(deviceId)
      console.warn(
        `[platform] Frame ahead failed for ${deviceId}`,
        error instanceof Error
          ? error.message
          : "unknown error",
      )
    } finally {
      lifecycle.isBusy = false
    }
  }
  const tick = async () => {
    if (lifecycle.isDisposed || lifecycle.isBusy) return
    const candidate = deviceIds
      .map((deviceId) => {
        const deviceTarget =
          platform.getDeviceTarget(deviceId)
        const target = deviceTarget
          ? platform.getTarget(deviceTarget)
          : null
        const display =
          platform.getDeviceProperties(deviceId)
        if (!target || !display) {
          // Back on its own views: the next platform target is a new view,
          // however soon it comes.
          states.delete(deviceId)
          return null
        }
        const capabilities =
          getPlatformDisplayCapabilities(display)
        const channels = platform.channelsForView(
          target.view,
        )
        const cameraInterval = target.view.panels
          .filter(
            (panel) => panel.specId === "camera-alert",
          )
          .map(
            (panel) =>
              Math.min(
                10,
                Math.max(
                  1,
                  Number(
                    panel.settings.snapshotIntervalSeconds,
                  ) || 1,
                ),
              ) * 1000,
          )
          .sort((left, right) => left - right)[0]
        const signature = JSON.stringify({
          // A camera snapshot is an acquisition-time fact, not a live-state claim.
          cameraFrame: cameraInterval
            ? Math.floor(Date.now() / cameraInterval)
            : undefined,
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
            cameraInterval ??
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
    if (!candidate) {
      // A display showing a frame now goes first; a frame kept for a watch
      // that may ask later waits for a quiet tick.
      const prerenderDeviceId = findPrerenderCandidate()
      if (prerenderDeviceId) {
        await prerender(prerenderDeviceId)
      }
      return
    }
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
      prerenderStates.clear()
    },
  }
}
