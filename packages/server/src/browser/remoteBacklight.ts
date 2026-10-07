import type {
  ChannelSnapshot,
  ContractData,
} from "@castkit/sdk/contracts"
import type { PlatformStore } from "../platform/platformStore.ts"

/** Direct device settings survive restarts without a broker or automation service. */
export const createRemoteBacklight = ({
  store,
  getChannel,
}: {
  store: PlatformStore
  getChannel: (id: string) => ChannelSnapshot | undefined
}) => {
  const lastRoomPower = new Map<string, boolean>()
  const get = (deviceId: string) =>
    store.get().deviceBacklights?.[deviceId] ?? {
      level: 100,
      power: "on" as const,
      channel: "",
      entity: "",
    }
  const resolve = (deviceId: string) => {
    const settings = get(deviceId)
    const snapshot = getChannel(settings.channel)
    const entity =
      snapshot?.type === "entities.v1" &&
      snapshot.status === "ready"
        ? (
            snapshot.data as
              | ContractData["entities.v1"]
              | null
          )?.entities.find(
            (entry) => entry.id === settings.entity,
          )
        : undefined
    const hasRoomState =
      entity?.state === "on" || entity?.state === "off"
    if (hasRoomState)
      lastRoomPower.set(deviceId, entity?.state === "on")
    const isOn =
      settings.power === "follow-room"
        ? (lastRoomPower.get(deviceId) ?? false)
        : settings.power === "on"
    return {
      backlight_percent: isOn ? settings.level : 0,
      room_status:
        settings.power !== "follow-room"
          ? "disabled"
          : hasRoomState
            ? entity?.state
            : "unavailable",
    }
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
    const previous = get(deviceId)
    const value = Number(payload)
    const next =
      kind === "backlightLevel" &&
      payload.trim() &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= 100
        ? { ...previous, level: Math.round(value) }
        : kind === "backlightPower" &&
            ["on", "off", "follow-room"].includes(payload)
          ? {
              ...previous,
              power: payload as typeof previous.power,
            }
          : kind === "backlightRoomChannel"
            ? { ...previous, channel: payload.trim() }
            : kind === "backlightRoomEntity"
              ? { ...previous, entity: payload.trim() }
              : null
    if (!next) return false
    if (
      next.channel !== previous.channel ||
      next.entity !== previous.entity
    ) {
      lastRoomPower.delete(deviceId)
    }
    store.update((state) => ({
      ...state,
      deviceBacklights: {
        ...state.deviceBacklights,
        [deviceId]: next,
      },
    }))
    return true
  }
  return { get, resolve, set }
}
