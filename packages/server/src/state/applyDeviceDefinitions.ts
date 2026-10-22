import { hasRestartingDeviceChanges } from "@castkit/shared/deviceDefinitionChanges"
import type { InkcastConfig } from "../config/env.ts"
import type { DeviceDefinition } from "./deviceDefinitionStore.ts"

/** Update existing runtime references together, or leave every runtime unchanged for reinitialization. */
export const applyDeviceDefinitions = ({
  config,
  definitions,
}: {
  config: InkcastConfig
  definitions: readonly DeviceDefinition[]
}) => {
  const current = [
    ...config.devices,
    ...config.browserDevices,
  ]
  if (
    current.length !== definitions.length ||
    current.some((device) => {
      const next = definitions.find(
        (definition) => definition.id === device.id,
      )
      return (
        !next ||
        hasRestartingDeviceChanges({
          previous: device,
          next,
        })
      )
    })
  )
    return null
  const changes = current.flatMap((device) => {
    const next = definitions.find(
      (definition) => definition.id === device.id,
    )
    if (
      !next ||
      JSON.stringify({ ...device, palette: undefined }) ===
        JSON.stringify({ ...next, palette: undefined })
    )
      return []
    return [{ device, next }]
  })
  changes.forEach(({ device, next }) => {
    const record = device as unknown as Record<
      string,
      unknown
    >
    Object.keys(record)
      .filter((key) => key !== "palette" && !(key in next))
      .forEach((key) => {
        delete record[key]
      })
    Object.assign(device, next)
  })
  return changes.map(({ device }) => device.id)
}
