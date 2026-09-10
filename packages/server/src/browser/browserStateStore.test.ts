import { describe, expect, test } from "vitest"
import type { BrowserDeviceConfig } from "../config/env.ts"
import { createBrowserStateStore } from "./browserStateStore.ts"

const buildDevice = (
  overrides: Partial<BrowserDeviceConfig> = {},
): BrowserDeviceConfig =>
  ({
    renderer: "browser",
    id: "dev-square",
    label: "Dev Square",
    mac: "00:00:00:00:00:01",
    width: 720,
    height: 720,
    shape: "square",
    hasTouch: true,
    colour: "full",
    hasMqttBacklight: true,
    externalViews: [],
    ...overrides,
  }) as BrowserDeviceConfig

const buildStore = (
  ...devices: readonly BrowserDeviceConfig[]
) =>
  createBrowserStateStore({
    devices: devices.length ? devices : [buildDevice()],
  })

/**
 * These panels are wall appliances, not browsers. "Auto" delegates the scheme
 * to the display's own OS colour preference, which nobody ever sets on a kiosk
 * Pi, so an Auto default is a permanent Light in practice — a white rectangle
 * glowing in a dark room. The default is Dark; Auto stays selectable.
 */
describe("the default theme", () => {
  test("a device with no retained setting is Dark", () => {
    const store = buildStore()

    expect(store.getSettings("dev-square").theme).toBe(
      "Dark",
    )
  })

  test("an unknown device id still gets Dark", () => {
    const store = buildStore()

    expect(store.getSettings("not-a-device").theme).toBe(
      "Dark",
    )
  })

  test("a restored Auto wins over the default", () => {
    const store = buildStore()

    store.setSettings({
      deviceId: "dev-square",
      settings: { theme: "Auto" },
    })

    expect(store.getSettings("dev-square").theme).toBe(
      "Auto",
    )
  })

  test("setting one field keeps the Dark default on the rest", () => {
    const store = buildStore()

    const next = store.setSettings({
      deviceId: "dev-square",
      settings: { orientation: 90 },
    })

    expect(next.orientation).toBe(90)
    expect(next.theme).toBe("Dark")
  })

  test("a device's configured rotation still seeds the orientation", () => {
    const store = buildStore(
      buildDevice({ id: "dev-flipped", rotation: 180 }),
    )

    expect(store.getSettings("dev-flipped")).toMatchObject({
      orientation: 180,
      theme: "Dark",
    })
  })
})
