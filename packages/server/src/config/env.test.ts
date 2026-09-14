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
  colorMode: "spectra6",
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

test("reads deployment-configured external browser views", () => {
  const config = loadConfig({
    INKCAST_DEVICES_FILE: writeDevicesFile([
      {
        renderer: "browser",
        id: "workbench",
        label: "Workbench Display",
        mac: "02:00:00:00:00:10",
        width: 480,
        height: 320,
        externalViews: [
          {
            name: "Disc App",
            url: "https://example.com/kiosk",
          },
        ],
      },
    ]),
  })

  expect(config.browserDevices[0]?.externalViews).toEqual([
    {
      name: "Disc App",
      url: "https://example.com/kiosk",
    },
  ])
})
