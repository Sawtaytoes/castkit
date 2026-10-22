import { clearMediaCache } from "./mediaCache.ts"
import type {
  DisplaySnapshot,
  DisplayTarget,
} from "./protocol.ts"

const entries = new Map<
  string,
  { snapshot: DisplaySnapshot; expiresAt: number }
>()
const access = { revision: 0 }
const MAX_VIEWS = 8
const MAX_AGE_MS = 60_000

/** Include the device context: its media, permissions and presentation can differ. */
export const displayCacheKey = (target: DisplayTarget) =>
  JSON.stringify([target.kind, target.id, target.deviceId])

/** Keep a small, memory-only set of recently authorized device compositions. */
export const rememberDisplay = (
  snapshot: DisplaySnapshot,
) => {
  if (snapshot.target.kind !== "view") return
  const key = displayCacheKey(snapshot.target)
  entries.delete(key)
  entries.set(key, {
    snapshot,
    expiresAt: Date.now() + MAX_AGE_MS,
  })
  if (entries.size > MAX_VIEWS) {
    const oldestKey = entries.keys().next().value
    if (oldestKey) entries.delete(oldestKey)
  }
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

/** Access changes invalidate every cached composition, including prefetched ones. */
export const clearDisplayCache = () => {
  access.revision += 1
  entries.clear()
  clearMediaCache()
}

/** Prevent an older in-flight warm-up from repopulating a cache after lock/sign-out. */
export const displayCacheRevision = () => access.revision
