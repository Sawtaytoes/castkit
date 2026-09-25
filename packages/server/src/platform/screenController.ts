import type { ScreenDefinition } from "@castkit/sdk/contracts"
import type { PlatformStore } from "./platformStore.ts"

type Override = {
  viewId: string
  priority: number
  expiresAt: number
  sequence: number
}
/** Stable screens keep their base selection while temporary, prioritized views appear. */
export const createScreenController = ({
  store,
  now = Date.now,
}: {
  store: PlatformStore
  now?: () => number
}) => {
  const overrides = new Map<string, Override[]>()
  const listeners = new Set<() => void>()
  const counter = { value: 0 }
  const emit = () =>
    listeners.forEach((listener) => {
      listener()
    })
  const getActiveViewId = (screen: ScreenDefinition) => {
    const winner = (overrides.get(screen.id) ?? [])
      .filter(
        (item) =>
          item.expiresAt > now() &&
          screen.viewIds.includes(item.viewId),
      )
      .toSorted(
        (left, right) =>
          right.priority - left.priority ||
          right.sequence - left.sequence,
      )[0]
    return (
      winner?.viewId ??
      (screen.activeViewId &&
      screen.viewIds.includes(screen.activeViewId)
        ? screen.activeViewId
        : screen.defaultViewId)
    )
  }
  const select = ({
    screenId,
    viewId,
    durationSeconds,
    priority = 0,
  }: {
    screenId: string
    viewId: string
    durationSeconds?: number
    priority?: number
  }) => {
    const screen = store
      .get()
      .screens.find((item) => item.id === screenId)
    if (!screen?.viewIds.includes(viewId))
      throw new Error(
        "The view is not assigned to this screen",
      )
    if (
      !Number.isFinite(priority) ||
      priority < 0 ||
      priority > 1000 ||
      (durationSeconds !== undefined &&
        (!Number.isFinite(durationSeconds) ||
          durationSeconds < 0 ||
          durationSeconds > 86400))
    )
      throw new Error(
        "Invalid screen override duration or priority",
      )
    if (durationSeconds) {
      counter.value += 1
      overrides.set(screenId, [
        ...(overrides.get(screenId) ?? []).filter(
          (item) =>
            item.expiresAt > now() &&
            item.viewId !== viewId,
        ),
        {
          viewId,
          priority,
          expiresAt: now() + durationSeconds * 1000,
          sequence: counter.value,
        },
      ])
    } else {
      overrides.delete(screenId)
      store.update((previous) => ({
        ...previous,
        screens: previous.screens.map((item) =>
          item.id === screenId
            ? { ...item, activeViewId: viewId }
            : item,
        ),
      }))
    }
    emit()
    return getActiveViewId(
      store
        .get()
        .screens.find((item) => item.id === screenId) ??
        screen,
    )
  }
  const timer = setInterval(() => {
    const hasExpired = Array.from(overrides.values()).some(
      (items) =>
        items.some((item) => item.expiresAt <= now()),
    )
    if (hasExpired) {
      overrides.forEach((items, id) => {
        overrides.set(
          id,
          items.filter((item) => item.expiresAt > now()),
        )
      })
      emit()
    }
  }, 250)
  timer.unref()
  return {
    select,
    getActiveViewId,
    changed: emit,
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
