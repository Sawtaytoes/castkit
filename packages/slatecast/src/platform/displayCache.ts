import { clearMediaCache } from "./mediaCache.ts"
import type {
  DisplaySnapshot,
  DisplayTarget,
} from "./protocol.ts"

const entries = new Map<
  string,
  {
    snapshot: DisplaySnapshot
    target: DisplayTarget
    expiresAt: number
  }
>()
const listeners = new Set<() => void>()
const changed = () =>
  listeners.forEach((listener) => {
    listener()
  })
const access = { revision: 0 }
const MAX_VIEWS = 8
const MAX_AGE_MS = 60_000

/** Include the device context: its media, permissions and presentation can differ. */
export const displayCacheKey = (target: DisplayTarget) =>
  JSON.stringify([target.kind, target.id, target.deviceId])

/** Keep a small, memory-only set of recently authorized device compositions. */
export const rememberDisplay = ({
  snapshot,
  target = snapshot.target,
}: {
  snapshot: DisplaySnapshot
  target?: DisplayTarget
}) => {
  if (target.kind !== "view") return
  const key = displayCacheKey(target)
  const hasNewTarget = !entries.has(key)
  entries.delete(key)
  entries.set(key, {
    snapshot,
    target,
    expiresAt: Date.now() + MAX_AGE_MS,
  })
  if (entries.size > MAX_VIEWS) {
    const oldestKey = entries.keys().next().value
    if (oldestKey) entries.delete(oldestKey)
  }
  if (hasNewTarget) changed()
}

/** A warm view can draw immediately; its new socket must authorize controls. */
export const recallDisplay = (target: DisplayTarget) => {
  const key = displayCacheKey(target)
  const entry = entries.get(key)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    entries.delete(key)
    return null
  }
  return entry.snapshot
}

/** Refresh in the background before a warm entry reaches its expiry. */
export const isDisplayRefreshDue = (
  target: DisplayTarget,
) =>
  (entries.get(displayCacheKey(target))?.expiresAt ?? 0) <=
  Date.now() + 30_000

/** An unavailable destination must not evict other authorized prepared views. */
export const forgetDisplay = (target: DisplayTarget) => {
  if (entries.delete(displayCacheKey(target))) changed()
}

/** Access changes invalidate every cached composition, including prefetched ones. */
export const clearDisplayCache = () => {
  access.revision += 1
  entries.clear()
  clearMediaCache()
  changed()
}

/** Prevent an older in-flight warm-up from repopulating a cache after lock/sign-out. */
export const displayCacheRevision = () => access.revision

/** Only matching device contexts may supply standby DOM; expired private data is excluded. */
export const listPreparedDisplays = (
  target: DisplayTarget,
) =>
  [...entries.values()]
    .reverse()
    .filter(
      (entry) =>
        entry.target.deviceId === target.deviceId &&
        entry.expiresAt > Date.now(),
    )
    .map((entry) => entry.snapshot)

/** Notify view hosts when standby destinations appear or access invalidates them. */
export const subscribePreparedDisplays = (
  listener: () => void,
) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
