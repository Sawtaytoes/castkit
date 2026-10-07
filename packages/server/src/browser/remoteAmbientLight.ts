import {
  type AmbientLightState,
  ambientLightSchema,
  DEFAULT_AMBIENT_LIGHT,
} from "@castkit/sdk/ambientLight"
import type { PlatformStore } from "../platform/platformStore.ts"

/** One disk-backed ambient-light state shared by management and MQTT. */
export const createRemoteAmbientLight = ({
  store,
  getCurrentView = () => undefined,
}: {
  store: PlatformStore
  getCurrentView?: (
    deviceId: string,
  ) => { id: string; name: string } | undefined
}) => {
  const get = (deviceId: string): AmbientLightState => ({
    ...DEFAULT_AMBIENT_LIGHT,
    ...store.get().deviceAmbientLights?.[deviceId],
    viewModes: {
      ...DEFAULT_AMBIENT_LIGHT.viewModes,
      ...store.get().deviceAmbientLights?.[deviceId]
        ?.viewModes,
    },
  })
  const resolve = (deviceId: string) => {
    const settings = get(deviceId)
    const view = getCurrentView(deviceId)
    const effectiveMode = settings.followView
      ? (settings.viewModes[view?.id ?? ""] ?? "off")
      : settings.mode
    return {
      ...settings,
      isOn: settings.isOn && effectiveMode !== "off",
      mode:
        effectiveMode === "off"
          ? settings.mode
          : effectiveMode,
      effectiveMode,
      view,
    }
  }
  const update = ({
    deviceId,
    updates,
  }: {
    deviceId: string
    updates: Partial<AmbientLightState>
  }) => {
    const parsed = ambientLightSchema.safeParse({
      ...get(deviceId),
      ...updates,
    })
    if (!parsed.success) return false
    store.update((previous) => ({
      ...previous,
      deviceAmbientLights: {
        ...previous.deviceAmbientLights,
        [deviceId]: parsed.data,
      },
    }))
    return true
  }
  const set = ({
    deviceId,
    kind,
    payload,
  }: {
    deviceId: string
    kind: string
    payload: string
  }) => {
    const updates =
      kind === "ambientLightPower" &&
      ["on", "off"].includes(payload)
        ? { isOn: payload === "on" }
        : kind === "ambientLightBrightness" &&
            /^\d+$/.test(payload)
          ? { brightness: Number(payload) }
          : kind === "ambientLightMode"
            ? { mode: payload, followView: false }
            : kind === "ambientLightDemo" &&
                ["true", "false"].includes(payload)
              ? { demo: payload === "true" }
              : kind === "ambientLightFollowView" &&
                  ["true", "false"].includes(payload)
                ? { followView: payload === "true" }
                : kind === "ambientLightViewModes"
                  ? (() => {
                      try {
                        return {
                          viewModes: JSON.parse(payload),
                        }
                      } catch {
                        return null
                      }
                    })()
                  : null
    if (!updates) return false
    const parsed = ambientLightSchema.safeParse({
      ...get(deviceId),
      ...updates,
    })
    return (
      parsed.success &&
      update({ deviceId, updates: parsed.data })
    )
  }
  return { get, resolve, update, set }
}
