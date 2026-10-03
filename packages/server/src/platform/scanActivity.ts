import type {
  ChannelSnapshot,
  ContractData,
  ViewDefinition,
} from "@castkit/sdk/contracts"
import {
  getScanWindow,
  readScanSeconds,
} from "@castkit/sdk/kidsPointsScan"
import { getTemporaryViewSeconds } from "@castkit/shared/panels/repaint"

/** Rebuild live snapshots at a scan's expiry even when the broker goes quiet. */
export const createScanActivity = ({
  getViews,
  onExpire,
  now = Date.now,
}: {
  getViews: () => ViewDefinition[]
  onExpire: () => void
  now?: () => number
}) => {
  const timers = new Map<
    string,
    Set<ReturnType<typeof setTimeout>>
  >()
  const clear = (id: string) => {
    timers.get(id)?.forEach(clearTimeout)
    timers.delete(id)
  }
  const observe = (snapshot: ChannelSnapshot) => {
    if (snapshot.type !== "kids-points.v1") return
    clear(snapshot.id)
    const data = snapshot.data as
      | ContractData["kids-points.v1"]
      | null
    const scan = data?.lastScan
    if (
      !scan ||
      !data?.kids.some((kid) => kid.id === scan.kidId)
    )
      return
    const boundaries = new Set(
      getViews()
        .flatMap((view) =>
          view.panels.flatMap((panel) => {
            if (
              !Object.values(panel.bindings).includes(
                snapshot.id,
              )
            )
              return []
            const requestedSeconds = readScanSeconds(
              panel.settings,
            )
            // Slow panels retain the same ten-repaint minimum as the view.
            const durations = new Set([
              requestedSeconds,
              getTemporaryViewSeconds({
                repaint: "slow",
                requestedSeconds,
              }) ?? requestedSeconds,
            ])
            return Array.from(durations).flatMap(
              (scanSeconds) => {
                const window = getScanWindow({
                  lastScan: scan,
                  scanSeconds,
                })
                return window
                  ? [window.startsAtMs, window.expiresAtMs]
                  : []
              },
            )
          }),
        )
        .filter((atMs) => atMs > now()),
    )
    const scheduled = new Set<
      ReturnType<typeof setTimeout>
    >()
    for (const atMs of boundaries) {
      const timer = setTimeout(() => {
        scheduled.delete(timer)
        if (scheduled.size === 0) timers.delete(snapshot.id)
        onExpire()
      }, atMs - now())
      timer.unref?.()
      scheduled.add(timer)
    }
    if (scheduled.size > 0)
      timers.set(snapshot.id, scheduled)
  }
  const dispose = () =>
    Array.from(timers.keys()).forEach(clear)
  return {
    observe,
    dispose,
    refresh: (snapshots: ChannelSnapshot[]) => {
      dispose()
      snapshots.forEach(observe)
    },
  }
}
