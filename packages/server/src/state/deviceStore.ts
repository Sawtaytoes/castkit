import type { ViewName } from "../views/registry.ts"

/**
 * In-memory per-device runtime state: the SELECTED view (the single source
 * of truth for what the panel shows — Home Assistant automations drive it),
 * and whether that selection was made explicitly this run (vs.
 * restored/default — guards the retained-MQTT restore on boot).
 */
export type DeviceStore = {
  getActiveView: (deviceId: string) => ViewName
  setActiveView: (params: {
    deviceId: string
    viewName: ViewName
    /** True when a user/API action set it; false for the boot-time restore. */
    isExplicit?: boolean
  }) => void
  /** Whether the view was explicitly chosen this run (blocks restores). */
  getHasExplicitView: (deviceId: string) => boolean
}

export const createDeviceStore = ({
  deviceIds,
  defaultView = "Now Playing (Dashboard)",
}: {
  deviceIds: readonly string[]
  defaultView?: ViewName
}): DeviceStore => {
  const activeViews = new Map<string, ViewName>(
    deviceIds.map((deviceId) => [deviceId, defaultView]),
  )
  const explicitDeviceIds = new Set<string>()

  return {
    getActiveView: (deviceId) =>
      activeViews.get(deviceId) ?? defaultView,
    setActiveView: ({
      deviceId,
      viewName,
      isExplicit = true,
    }) => {
      activeViews.set(deviceId, viewName)
      if (isExplicit) {
        explicitDeviceIds.add(deviceId)
      }
    },
    getHasExplicitView: (deviceId) =>
      explicitDeviceIds.has(deviceId),
  }
}
