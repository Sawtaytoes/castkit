import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test } from "vitest"
import { loadConfig } from "./env.ts"

const writeDevicesFile = (devices: readonly unknown[]) => {
  const directory = mkdtempSync(
    join(tmpdir(), "castkit-devices-"),
  )
  const devicesFile = join(directory, "devices.json")
  writeFileSync(devicesFile, JSON.stringify(devices))
  return devicesFile
}

const BASE_DEVICE = {
  id: "frame",
  label: "Frame",
  mac: "02:00:00:00:00:09",
  width: 1600,
  height: 1200,
  colourMode: "e6",
}

test("reads a device's photoPeople seed list", () => {
  const config = loadConfig({
    INKCAST_DEVICES_FILE: writeDevicesFile([
      {
        ...BASE_DEVICE,
        photoPeople: ["Ada", "Grace", "Alan"],
      },
    ]),
  })

  expect(config.devices[0]?.photoPeople).toEqual([
    "Ada",
    "Grace",
    "Alan",
  ])
})

test("leaves photoPeople undefined when a device omits it", () => {
  const config = loadConfig({
    INKCAST_DEVICES_FILE: writeDevicesFile([BASE_DEVICE]),
  })

  expect(config.devices[0]?.photoPeople).toBeUndefined()
})

test("rejects photoPeople written as a comma string", () => {
  expect(() =>
    loadConfig({
      INKCAST_DEVICES_FILE: writeDevicesFile([
        { ...BASE_DEVICE, photoPeople: "Ada, Grace" },
      ]),
    }),
  ).toThrow()
})
