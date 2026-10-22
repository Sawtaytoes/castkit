import { useEffect } from "preact/hooks"
import {
  displayCacheRevision,
  forgetDisplay,
  isDisplayRefreshDue,
  recallDisplay,
  rememberDisplay,
} from "./displayCache.ts"
import type {
  DisplaySnapshot,
  DisplayTarget,
} from "./protocol.ts"
import { warmViewAssets } from "./viewAssets.ts"

/** Warm assigned local views one at a time after the visible page has had first turn. */
export const useWarmDeviceViews = (
  targets: DisplayTarget[],
) => {
  const targetKey = JSON.stringify(targets)
  useEffect(() => {
    const query = new URLSearchParams(
      window.location.search,
    )
    if (
      query.get("preview") === "1" ||
      query.get("capture") === "1"
    )
      return
    const controller = new AbortController()
    const lifecycle = { isDisposed: false, timer: 0 }
    const warm = async () => {
      const accessRevision = displayCacheRevision()
      await targets
        .slice(0, 8)
        .reduce(async (previous, target) => {
          await previous
          if (
            lifecycle.isDisposed ||
            accessRevision !== displayCacheRevision() ||
            document.visibilityState === "hidden"
          )
            return
          if (!isDisplayRefreshDue(target)) {
            const snapshot = recallDisplay(target)
            if (snapshot)
              await warmViewAssets({
                snapshot,
                signal: controller.signal,
              })
            return
          }
          try {
            const response = await fetch(
              `/api/display/${target.kind}/${encodeURIComponent(target.id)}${target.deviceId ? `?device=${encodeURIComponent(target.deviceId)}&preload=1` : ""}`,
              {
                credentials: "same-origin",
                cache: "no-store",
                signal: controller.signal,
              },
            )
            if (
              lifecycle.isDisposed ||
              accessRevision !== displayCacheRevision()
            )
              return
            if (
              response.status === 401 ||
              response.status === 403
            ) {
              forgetDisplay(target)
              return
            }
            if (!response.ok) return
            const snapshot: DisplaySnapshot =
              await response.json()
            if (
              lifecycle.isDisposed ||
              accessRevision !== displayCacheRevision()
            )
              return
            // A foreground subscription may have supplied newer data during fetch.
            if (isDisplayRefreshDue(target))
              rememberDisplay({ snapshot, target })
            await warmViewAssets({
              snapshot,
              signal: controller.signal,
            })
          } catch {
            // A warm-up failure never blocks the active view or the next swipe.
          }
        }, Promise.resolve())
    }
    const schedule = (delay: number) => {
      lifecycle.timer = window.setTimeout(() => {
        void warm().finally(() => {
          if (!lifecycle.isDisposed) schedule(30_000)
        })
      }, delay)
    }
    if (targets.length) schedule(1200)
    return () => {
      lifecycle.isDisposed = true
      clearTimeout(lifecycle.timer)
      controller.abort()
    }
  }, [targetKey])
}
