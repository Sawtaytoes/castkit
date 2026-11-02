import type { ChannelSnapshot, ContractData, ViewPanel } from "@castkit/sdk/contracts"
import { SCREENSHOT_EPOCH_MILLIS } from "../../stories/freezeClockUnderAutomation.ts"
import type { DisplaySnapshot } from "../protocol.ts"

const groups = [
  { title: "Network cabinet", devices: ["Router and storage", "Access switches", "Core switch"] },
  { title: "Server cabinet", devices: ["Compute A", "Compute B", "Storage A", "Storage B"] },
  { title: "Workspace", devices: ["Desk A", "Desk B", "Shared desk"] },
  { title: "Studio", devices: ["Computer", "Display"] },
  { title: "Media room", devices: ["Console", "Media"] },
]

/** Five groups, nineteen chart panels, mixed duration units, and missing observations. */
export const powerOverviewFixture = ({ isCompactHistory = false } = {}): DisplaySnapshot => {
  const items = groups.flatMap((group, groupIndex) =>
    ["Circuit power draw", ...group.devices].map((title, deviceIndex) => {
      const id = `power-${groupIndex}-${deviceIndex}`
      const entities: ContractData["entities.v1"]["entities"] = (deviceIndex === 0 ? ["Power"] : ["Power", "Runtime"]).map((name, index) => {
        const isDuration = index === 1
        const isUnavailable = isDuration && (groupIndex + deviceIndex) % 3 === 0
        const value = isDuration ? (groupIndex === 4 ? 11425 : 63.75) : deviceIndex === 0 ? 480 : deviceIndex * 70
        return {
          id: `sensor.${id}_${index}`, name, domain: "sensor", actions: [],
          state: isUnavailable ? "unavailable" : String(value),
          attributes: {
            unit_of_measurement: isDuration ? (groupIndex === 4 ? "s" : "min") : "W",
            device_class: isDuration ? "duration" : "power",
            history: isUnavailable ? [] : Array.from({ length: 60 }, (_, sampleIndex) => ({ time: SCREENSHOT_EPOCH_MILLIS - (60 - sampleIndex) * 60000, value: value * (0.8 + Math.sin(sampleIndex / 4) * 0.1) })),
            stateHistory: isUnavailable ? [{ time: SCREENSHOT_EPOCH_MILLIS - 3600000, state: "unavailable" }] : [],
          },
        }
      })
      const panel: ViewPanel = { id, specId: "charts", bindings: { data: id }, settings: { title, presentation: "home", homeGroup: String(groupIndex), homeGroupTitle: group.title, homeAccent: "blue", isCompactHistory } }
      const channel: ChannelSnapshot = { id, type: "entities.v1", status: "ready", data: { entities } }
      return { panel, channel }
    }),
  )
  return {
    target: { kind: "view", id: "power-overview" }, canControl: false,
    view: { id: "power-overview", name: "Power overview", layout: "grid", theme: "dark", access: "public", isControlEnabled: false, panels: items.map(({ panel }) => panel) },
    channels: Object.fromEntries(items.map(({ channel }) => [channel.id, channel])),
  }
}
