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
 * Routine edits also update the existing runtime references. Registry/transport
 * changes reinitialize the process to wire subscriptions and workers.
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

  const persist = (
    nextDefinitions: readonly DeviceDefinition[],
  ) => {
    if (!devicesFile) {
      throw new Error(
        "Device editing needs INKCAST_DEVICES_FILE to point to persistent storage.",
      )
    }
    const temporaryFile = `${devicesFile}.next`
    writeFileSync(
      temporaryFile,
      `${JSON.stringify(nextDefinitions.map(toPersistedDevice), null, 2)}\n`,
      "utf8",
    )
    renameSync(temporaryFile, devicesFile)
  }

  return {
    getAll: () => definitions,
    replaceAll: (nextDefinitions) => {
      persist(nextDefinitions)
      definitions.splice(
        0,
        definitions.length,
        ...nextDefinitions,
      )
    },
  }
}
