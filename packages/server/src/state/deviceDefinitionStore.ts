import { renameSync, writeFileSync } from "node:fs"
import type {
  BrowserDeviceConfig,
  ConfiguredDevice,
} from "../config/env.ts"

export type DeviceDefinition =
  | Omit<ConfiguredDevice, "palette">
  | BrowserDeviceConfig

export type DeviceDefinitionStore = {
  getAll: () => readonly DeviceDefinition[]
  replaceAll: (devices: readonly DeviceDefinition[]) => void
}

const toPersistedDevice = (device: DeviceDefinition) => {
  const { palette: _palette, ...persistedDevice } =
    device as ConfiguredDevice
  return persistedDevice
}

/**
 * The static device registry is stored in the persistent devices JSON file.
 * A saved definition takes effect after the process restarts, which is what
 * also wires its MQTT subscriptions and Home Assistant discovery entities.
 */
export const createDeviceDefinitionStore = ({
  browserDevices,
  devices,
  devicesFile,
}: {
  browserDevices: readonly BrowserDeviceConfig[]
  devices: readonly ConfiguredDevice[]
  devicesFile: string | undefined
}): DeviceDefinitionStore => {
  const definitions: DeviceDefinition[] = [
    ...devices.map(toPersistedDevice),
    ...browserDevices,
  ]

  const persist = () => {
    if (!devicesFile) {
      throw new Error(
        "Device editing needs INKCAST_DEVICES_FILE to point to persistent storage.",
      )
    }
    const temporaryFile = `${devicesFile}.next`
    writeFileSync(
      temporaryFile,
      `${JSON.stringify(definitions.map(toPersistedDevice), null, 2)}\n`,
      "utf8",
    )
    renameSync(temporaryFile, devicesFile)
  }

  return {
    getAll: () => definitions,
    replaceAll: (nextDefinitions) => {
      definitions.splice(
        0,
        definitions.length,
        ...nextDefinitions,
      )
      persist()
    },
  }
}
