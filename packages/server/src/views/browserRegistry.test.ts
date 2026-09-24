import { describe, expect, test } from "vitest"
import type { BrowserDeviceConfig } from "../config/env.ts"
import { getBrowserViewsForDevice } from "./browserRegistry.ts"

const buildDevice = (
  overrides: Partial<BrowserDeviceConfig> = {},
): BrowserDeviceConfig =>
  ({
    renderer: "browser",
    id: "dev-panel",
    label: "Dev Panel",
    mac: "00:00:00:00:00:01",
    width: 1_280,
    height: 720,
    shape: "rectangle",
    hasTouch: true,
    hasViewDrawer: false,
    color: "full",
    rotation: 0,
    externalViews: [],
    ...overrides,
  }) as BrowserDeviceConfig

describe("getBrowserViewsForDevice", () => {
  test("offers Printer Status to a touch panel", () => {
    expect(
      getBrowserViewsForDevice(buildDevice()).map(
        (view) => view.name,
      ),
    ).toContain("Printer Status")
  })

  test("withholds Printer Status from a display-only panel", () => {
    expect(
      getBrowserViewsForDevice(
        buildDevice({ hasTouch: false }),
      ).map((view) => view.name),
    ).not.toContain("Printer Status")
  })

  test("refuses an external view named after a built-in view", () => {
    expect(() =>
      getBrowserViewsForDevice(
        buildDevice({
          externalViews: [
            {
              name: "Printer Status",
              url: "https://example.com/camwall",
            },
          ],
        }),
      ),
    ).toThrow(/named after a built-in view: Printer Status/)
  })

  test("refuses it even when the device names no views", () => {
    expect(() =>
      getBrowserViewsForDevice(
        buildDevice({
          externalViews: [
            {
              name: "Clock",
              url: "https://example.com/clock",
            },
          ],
        }),
      ),
    ).toThrow(/named after a built-in view: Clock/)
  })
})
