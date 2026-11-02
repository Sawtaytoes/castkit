import type { ContractData } from "@castkit/sdk/contracts"

type Entity =
  ContractData["entities.v1"]["entities"][number]

/** Missing measurements have no unit; duration sensors use one readable estimate. */
export const formatSensorValue = (entity: Entity) => {
  if (entity.state === "unavailable") return "Unavailable"
  if (entity.state === "unknown") return "Unknown"
  const unit =
    typeof entity.attributes.unit_of_measurement ===
    "string"
      ? entity.attributes.unit_of_measurement
      : ""
  const value =
    entity.state.trim() === ""
      ? Number.NaN
      : Number(entity.state)
  const secondsPerUnit = (
    { s: 1, min: 60, h: 3600, d: 86400 } as Record<
      string,
      number
    >
  )[unit]
  if (
    entity.attributes.device_class === "duration" &&
    secondsPerUnit &&
    Number.isFinite(value) &&
    value >= 0
  ) {
    const minutes = Math.round(
      (value * secondsPerUnit) / 60,
    )
    if (minutes === 0 && value > 0) return "<1 min"
    if (minutes < 60) return `${minutes} min`
    const hours = Math.floor(minutes / 60)
    const remainder = minutes % 60
    return `${hours}h${remainder ? ` ${remainder}m` : ""}`
  }
  const formatted =
    Number.isFinite(value) && unit
      ? value.toLocaleString(undefined, {
          ...(Math.abs(value) > 0 && Math.abs(value) < 0.01
            ? { maximumSignificantDigits: 3 }
            : { maximumFractionDigits: 2 }),
        })
      : entity.state
  return `${formatted}${unit ? ` ${unit}` : ""}`
}
