import { expect, test } from "vitest"
import {
  getDisplayCompatibility,
  getPlatformDisplayCapabilities,
} from "./displayCompatibility.ts"
import { createPlatformCatalog } from "./platformCatalog.ts"

test("battery power reduces repaint capability and clock precision follows freshness", () => {
  expect(
    getPlatformDisplayCapabilities({
      delivery: "browser",
      repaint: "instant",
    }).hasClockSeconds,
  ).toBe(true)
  expect(
    getPlatformDisplayCapabilities({
      delivery: "image",
      repaint: "fast",
      power: "battery",
    }),
  ).toMatchObject({
    repaint: "slow",
    hasClockSeconds: false,
    hasClockMinutes: true,
    hasLiveCamera: false,
  })
  expect(
    getPlatformDisplayCapabilities({
      delivery: "image",
      repaint: "slow",
      power: "battery",
    }).hasClockMinutes,
  ).toBe(false)
})
test("composition assignment rejects a camera or clock incompatible with the target", () => {
  const catalog = createPlatformCatalog()
  const view = {
    id: "view",
    name: "View",
    layout: "single" as const,
    panels: [
      {
        id: "panel",
        specId: "cameras",
        bindings: { data: "camera" },
        settings: {},
      },
    ],
    theme: "dark" as const,
    access: "public" as const,
    isControlEnabled: false,
  }
  expect(
    getDisplayCompatibility({
      view,
      catalog,
      display: { delivery: "image", repaint: "fast" },
    }).isCompatible,
  ).toBe(false)
  expect(
    getDisplayCompatibility({
      view: {
        ...view,
        panels: [
          {
            id: "panel",
            bindings: {},
            settings: {},
            specId: "clock",
          },
        ],
      },
      catalog,
      display: { delivery: "image", repaint: "super-slow" },
    }).isCompatible,
  ).toBe(false)
  expect(
    getDisplayCompatibility({
      view,
      catalog,
      display: { delivery: "browser", repaint: "instant" },
    }).isCompatible,
  ).toBe(true)
})
