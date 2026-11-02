type Override = {
  viewId: string
  overrideId?: string
  navigationId?: string
  priority: number
  expiresAt: number
  sequence: number
}

const readOverrideId = (value: unknown) => {
  if (value === undefined) return undefined
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 128
  ) {
    throw new Error("Invalid display override ID")
  }
  return value
}

/**
 * Temporary views on one physical display, whatever that display normally
 * shows.
 *
 * A screen override needs a screen, and most displays are not on one: they
 * run their own view list. This is the same override one level down — the
 * highest priority wins, a more recent request wins a tie, and the display
 * returns to its own view system when the last one expires. Nothing here is
 * saved; a restart ends every temporary view, as it does for screens.
 *
 * The caller has already checked the view against the display and set the
 * duration the display's grade allows.
 */
export const createDeviceOverrides = ({
  now = Date.now,
}: {
  now?: () => number
} = {}) => {
  const overrides = new Map<string, Override[]>()
  const listeners = new Set<() => void>()
  const counter = { value: 0 }
  const emit = () =>
    listeners.forEach((listener) => {
      listener()
    })
  const getActive = (deviceId: string) =>
    (overrides.get(deviceId) ?? [])
      .filter((item) => item.expiresAt > now())
      .toSorted(
        (left, right) =>
          right.priority - left.priority ||
          right.sequence - left.sequence,
      )[0]
  const getViewId = (deviceId: string) =>
    getActive(deviceId)?.viewId
  const show = ({
    deviceId,
    viewId,
    durationSeconds,
    priority = 0,
    navigationId,
    overrideId: requestedOverrideId,
  }: {
    deviceId: string
    viewId: string
    durationSeconds: number
    priority?: number
    navigationId?: string
    overrideId?: unknown
  }) => {
    const overrideId = readOverrideId(requestedOverrideId)
    if (
      !Number.isFinite(priority) ||
      priority < 0 ||
      priority > 1000 ||
      !Number.isFinite(durationSeconds) ||
      durationSeconds <= 0 ||
      durationSeconds > 86400
    )
      throw new Error(
        "Invalid display override duration or priority",
      )
    counter.value += 1
    overrides.set(deviceId, [
      ...(overrides.get(deviceId) ?? []).filter(
        (item) =>
          item.expiresAt > now() &&
          (overrideId === undefined
            ? item.overrideId !== undefined ||
              item.viewId !== viewId
            : item.overrideId !== overrideId),
      ),
      {
        viewId,
        ...(overrideId === undefined ? {} : { overrideId }),
        ...(navigationId ? { navigationId } : {}),
        priority,
        expiresAt: now() + durationSeconds * 1000,
        sequence: counter.value,
      },
    ])
    emit()
    return getViewId(deviceId)
  }
  const clear = ({
    deviceId,
    viewId,
    overrideId: requestedOverrideId,
  }: {
    deviceId: string
    viewId: string
    overrideId?: unknown
  }) => {
    const overrideId = readOverrideId(requestedOverrideId)
    const current = overrides.get(deviceId)
    const remaining = current?.filter(
      (item) =>
        item.viewId !== viewId ||
        item.overrideId !== overrideId,
    )
    if (!current || remaining?.length === current.length)
      return
    if (remaining?.length)
      overrides.set(deviceId, remaining)
    else overrides.delete(deviceId)
    emit()
  }
  const timer = setInterval(() => {
    const hasExpired = Array.from(overrides.values()).some(
      (items) =>
        items.some((item) => item.expiresAt <= now()),
    )
    if (hasExpired) {
      overrides.forEach((items, id) => {
        const remaining = items.filter(
          (item) => item.expiresAt > now(),
        )
        if (remaining.length === 0) overrides.delete(id)
        else overrides.set(id, remaining)
      })
      emit()
    }
  }, 250)
  timer.unref()
  return {
    show,
    clear,
    getViewId,
    getActive,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    dispose: () => {
      clearInterval(timer)
      listeners.clear()
    },
  }
}
