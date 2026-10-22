import { expect, test } from "vitest"
import {
  loadConfig,
  parseDeviceDefinition,
} from "../config/env.ts"
import { applyDeviceDefinitions } from "./applyDeviceDefinitions.ts"

const browser = () => {
  const device = parseDeviceDefinition({
    renderer: "browser",
    id: "test-display",
    label: "Original display",
    mac: "00:11:22:33:44:55",
    width: 1024,
    height: 600,
    hasTouch: true,
  })
  if (!("renderer" in device))
    throw new Error("Expected browser fixture")
  return device
}

test("routine edits update existing runtime references and clear removed optional settings", () => {
  const original = {
    ...browser(),
    contrast: "high" as const,
  }
  const config = {
    ...loadConfig({}),
    devices: [],
    browserDevices: [original],
  } as ReturnType<typeof loadConfig>
  const next = {
    ...browser(),
    label: "Updated display",
    hasViewDrawer: true,
  }
  expect(
    applyDeviceDefinitions({ config, definitions: [next] }),
  ).toEqual([original.id])
  expect(config.browserDevices[0]).toBe(original)
  expect(original.label).toBe("Updated display")
  expect(original.hasViewDrawer).toBe(true)
  expect(original.contrast).toBeUndefined()
})

test("structural changes leave all running definitions untouched until restart", () => {
  const first = browser()
  const second = { ...browser(), id: "second-display" }
  const config = {
    ...loadConfig({}),
    devices: [],
    browserDevices: [first, second],
  } as ReturnType<typeof loadConfig>
  expect(
    applyDeviceDefinitions({
      config,
      definitions: [
        { ...first, label: "New name" },
        { ...second, width: 800 },
      ],
    }),
  ).toBeNull()
  expect(first.label).toBe("Original display")
  expect(second.width).toBe(1024)
  expect(
    applyDeviceDefinitions({
      config,
      definitions: [first],
    }),
  ).toBeNull()
})

test("startup validation also rejects invalid live device definitions", () => {
  expect(() =>
    parseDeviceDefinition({
      ...browser(),
      contrast: "invalid",
    }),
  ).toThrow()
  expect(() =>
    parseDeviceDefinition({ ...browser(), width: 0 }),
  ).toThrow()
})
