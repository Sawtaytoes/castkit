import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Hono } from "hono"
import { expect, test } from "vitest"
import { loadConfig } from "../config/env.ts"
import { createChannelHub } from "../platform/channelHub.ts"
import { createPlatformStore } from "../platform/platformStore.ts"
import { createBrowserMode } from "./browserMode.ts"

test("management controls and the device endpoint work with MQTT disabled and persist after restart", async () => {
  const directory = mkdtempSync(
    join(tmpdir(), "castkit-direct-panel-"),
  )
  const devicesFile = join(directory, "devices.json")
  const file = join(directory, "platform.json")
  writeFileSync(
    devicesFile,
    JSON.stringify([
      {
        renderer: "browser",
        id: "panel",
        label: "Test",
        mac: "02:00:00:00:00:01",
        width: 480,
        height: 480,
        hasMqttBacklight: false,
        hasRemoteBacklight: true,
      },
    ]),
  )
  const config = loadConfig({
    INKCAST_DEVICES_FILE: devicesFile,
  })
  const create = () =>
    createBrowserMode({
      config,
      publisher: {
        isEnabled: false,
        publish: async () => {
          throw new Error("MQTT is unavailable")
        },
        subscribe: async () => {},
        close: async () => {},
      },
      getGlobalClockConfig: () => ({
        isTwelveHour: false,
        isNumericDate: false,
      }),
      platform: {
        store: createPlatformStore({ file }),
        hub: createChannelHub(),
        runtime: { executeAction: async () => null },
      },
    })
  const mode = create()
  try {
    await mode.start()
    expect(
      await mode.setDeviceSetting({
        deviceId: "panel",
        kind: "backlightLevel",
        payload: "35",
      }),
    ).toBe(true)
    expect(
      await mode.setDeviceSetting({
        deviceId: "panel",
        kind: "backlightPower",
        payload: "off",
      }),
    ).toBe(true)
    const app = new Hono()
    mode.attach(app)
    expect(
      (
        await (
          await app.request("/d/panel/castkit.json")
        ).json()
      ).controls_url,
    ).toBe("/d/panel/controls.json")
    expect(
      (
        await (
          await app.request("/d/panel/controls.json")
        ).json()
      ).backlight_percent,
    ).toBe(0)
    const restored = create()
    try {
      expect(
        restored.getDeviceSettings("panel"),
      ).toMatchObject({
        backlightLevel: "35",
        backlightPower: "off",
      })
      await restored.setDeviceSetting({
        deviceId: "panel",
        kind: "backlightPower",
        payload: "on",
      })
      const restoredApp = new Hono()
      restored.attach(restoredApp)
      expect(
        (
          await (
            await restoredApp.request(
              "/d/panel/controls.json",
            )
          ).json()
        ).backlight_percent,
      ).toBe(35)
    } finally {
      restored.stop()
    }
  } finally {
    mode.stop()
    rmSync(directory, { recursive: true, force: true })
  }
})
