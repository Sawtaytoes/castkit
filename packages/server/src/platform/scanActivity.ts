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
    if (snapshot.type === "entities.v1") {
      clear(snapshot.id)
      const data = snapshot.data as
        | ContractData["entities.v1"]
        | null
      const scheduled = new Set<
        ReturnType<typeof setTimeout>
      >()
      const deadlines = new Set(
        data?.entities
          .filter(
            (entity) =>
              entity.domain === "timer" &&
              entity.state === "active",
          )
          .map((entity) =>
            Date.parse(
              String(entity.attributes.finishes_at),
            ),
          )
          .filter(
            (deadline) =>
              Number.isFinite(deadline) && deadline > now(),
          ) ?? [],
      )
      deadlines.forEach((deadline) => {
        const timer = setTimeout(
          () => {
            scheduled.delete(timer)
            if (scheduled.size === 0)
              timers.delete(snapshot.id)
            onExpire()
          },
          Math.min(2_147_483_647, deadline - now()),
        )
        timer.unref?.()
        scheduled.add(timer)
      })
      if (scheduled.size) timers.set(snapshot.id, scheduled)
      return
    }
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
    const countdownBoundaries = data.kids.flatMap((kid) => {
      const task = kid.activeTask
      return task?.isCountdown && task.goalMinutes
        ? [task.startedAtMs + task.goalMinutes * 60_000]
        : []
    })
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
        .concat(countdownBoundaries)
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
