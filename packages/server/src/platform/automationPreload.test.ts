import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { ViewDefinition } from "@castkit/sdk/contracts"
import { Hono } from "hono"
import { expect, onTestFinished, test, vi } from "vitest"
import { parseDeviceDefinition } from "../config/env.ts"
import { createPlatform } from "./platform.ts"
import { attachPlatformRoutes } from "./platformRoutes.ts"

const view: ViewDefinition = {
  id: "points",
  name: "Room points",
  layout: "single",
  theme: "dark",
  access: "public",
  isControlEnabled: true,
  panels: [
    {
      id: "text",
      specId: "text",
      bindings: {},
      settings: { content: "Ready" },
    },
  ],
}
const fixture = async () => {
  const directory = mkdtempSync(
    join(tmpdir(), "castkit-automation-preload-"),
  )
  const device = parseDeviceDefinition({
    renderer: "browser",
    id: "panel",
    label: "Image worker",
    mac: "00:11:22:33:44:55",
    width: 480,
    height: 480,
    repaint: "fast",
    externalViews: [],
  })
  if (!("renderer" in device))
    throw new Error("Expected browser renderer")
  const options = {
    file: join(directory, "platform.json"),
    browserDevices: [device],
    publisher: {
      isEnabled: false,
      publish: vi.fn(async () => undefined),
      subscribe: vi.fn(async () => undefined),
      close: async () => undefined,
    },
  }
  const platform = await createPlatform(options)
  onTestFinished(() => {
    platform.dispose()
    rmSync(directory, { recursive: true, force: true })
  })
  platform.store.update((state) => ({
    ...state,
    views: [view],
  }))
  return { platform, options }
}

test("a renderer without external links retains automation destinations across restart without restoring an override", async () => {
  const { platform, options } = await fixture()
  expect(platform.getDevicePreloadViewIds("panel")).toEqual(
    [],
  )
  platform.showOnDevice({
    deviceId: "panel",
    viewId: "points",
    durationSeconds: 30,
    priority: 50,
  })
  expect(platform.getDevicePreloadViewIds("panel")).toEqual(
    ["points"],
  )
  platform.deviceOverrides.clear({
    deviceId: "panel",
    viewId: "points",
  })
  expect(platform.getDeviceTarget("panel")).toBeUndefined()
  const restored = await createPlatform(options)
  onTestFinished(() => restored.dispose())
  expect(restored.getDeviceTarget("panel")).toBeUndefined()
  expect(restored.getDevicePreloadViewIds("panel")).toEqual(
    ["points"],
  )
  const app = new Hono()
  attachPlatformRoutes({ app, platform: restored })
  const prepared = await app.request(
    "/api/display/view/points?device=panel&preload=1",
  )
  expect(prepared.status).toBe(200)
  expect(await prepared.json()).toMatchObject({
    canControl: false,
    displayProperties: { repaint: "fast" },
  })
})

test("history is bounded, records validated destinations only, and does not change override priority", async () => {
  const { platform } = await fixture()
  platform.store.update((state) => ({
    ...state,
    views: Array.from({ length: 10 }, (_, index) => ({
      ...view,
      id: `view-${index}`,
    })),
  }))
  platform.showOnDevice({
    deviceId: "panel",
    viewId: "view-0",
    durationSeconds: 30,
    priority: 100,
  })
  Array.from(
    { length: 9 },
    (_, index) => index + 1,
  ).forEach((index) => {
    platform.showOnDevice({
      deviceId: "panel",
      viewId: `view-${index}`,
      durationSeconds: 30,
      priority: 50,
    })
  })
  expect(platform.getDeviceTarget("panel")).toEqual({
    kind: "view",
    id: "view-0",
  })
  expect(platform.getDevicePreloadViewIds("panel")).toEqual(
    [
      "view-9",
      "view-8",
      "view-7",
      "view-6",
      "view-5",
      "view-4",
      "view-3",
      "view-2",
    ],
  )
  expect(() =>
    platform.showOnDevice({
      deviceId: "panel",
      viewId: "unknown",
      durationSeconds: 30,
    }),
  ).toThrow()
  expect(
    platform.getDevicePreloadViewIds("panel"),
  ).toHaveLength(8)
  platform.store.update((state) => ({
    ...state,
    views: state.views.filter(
      (item) => item.id !== "view-9",
    ),
  }))
  expect(
    platform.getDevicePreloadViewIds("panel"),
  ).not.toContain("view-9")
})
