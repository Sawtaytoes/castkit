type Override = {
  viewId: string
  priority: number
  expiresAt: number
  sequence: number
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
  const getViewId = (deviceId: string) =>
    (overrides.get(deviceId) ?? [])
      .filter((item) => item.expiresAt > now())
      .toSorted(
        (left, right) =>
          right.priority - left.priority ||
          right.sequence - left.sequence,
      )[0]?.viewId
  const show = ({
    deviceId,
    viewId,
    durationSeconds,
    priority = 0,
  }: {
    deviceId: string
    viewId: string
    durationSeconds: number
    priority?: number
  }) => {
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
          item.expiresAt > now() && item.viewId !== viewId,
      ),
      {
        viewId,
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
  }: {
    deviceId: string
    viewId: string
  }) => {
    const current = overrides.get(deviceId)
    const remaining = current?.filter(
      (item) => item.viewId !== viewId,
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
