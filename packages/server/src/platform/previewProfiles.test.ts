import { IMPRESSION_DEVICE } from "@castkit/core/devices/device"
import type { ViewDefinition } from "@castkit/sdk/contracts"
import { Hono } from "hono"
import { afterEach, expect, test, vi } from "vitest"
import type { PushController } from "../pushController.ts"
import { createDeviceDefinitionStore } from "../state/deviceDefinitionStore.ts"
import {
  createPlatform,
  type Platform,
} from "./platform.ts"
import { attachPlatformRoutes } from "./platformRoutes.ts"
import {
  attachPreviewRoutes,
  getPreviewProfiles,
} from "./previewProfiles.ts"

const runtimes = new Set<Platform>()
afterEach(() => {
  runtimes.forEach((platform) => {
    platform.dispose()
  })
  runtimes.clear()
})
const fixture = async () => {
  const publisher = {
    isEnabled: true,
    publish: vi.fn(async () => {}),
    subscribe: vi.fn(async () => {}),
    close: async () => {},
  }
  const devices = [
    {
      ...IMPRESSION_DEVICE,
      id: "one",
      label: "First panel",
    },
    {
      ...IMPRESSION_DEVICE,
      id: "two",
      label: "Second panel",
    },
    {
      ...IMPRESSION_DEVICE,
      id: "rotated",
      label: "Portrait panel",
      rotation: 90 as const,
    },
  ]
  const platform = await createPlatform({
    publisher,
    devices,
    apiToken: "fixture-token",
  })
  runtimes.add(platform)
  const view: ViewDefinition = {
    id: "agenda",
    name: "Agenda",
    layout: "single",
    theme: "light",
    access: "pin",
    isControlEnabled: false,
    panels: [
      {
        id: "main",
        specId: "calendar",
        bindings: {},
        settings: {},
      },
    ],
  }
  platform.store.update((previous) => ({
    ...previous,
    views: [
      view,
      {
        ...view,
        id: "camera",
        panels: [
          {
            id: "main",
            specId: "cameras",
            bindings: {},
            settings: {},
          },
        ],
      },
    ],
  }))
  const definitions = createDeviceDefinitionStore({
    devices,
    browserDevices: [],
    devicesFile: undefined,
  })
  const renderPreview = vi.fn(async () =>
    Buffer.from("fixture-png"),
  )
  const pushController: PushController = {
    deviceById: new Map(
      devices.map((device) => [device.id, device]),
    ),
    getRenderSettings: (id) => {
      const device = devices.find((item) => item.id === id)
      return device ? { device } : null
    },
    renderPreview,
    renderDevice: async () => null,
    pushDevice: async () => false,
    setView: async () => false,
  }
  const app = new Hono()
  attachPlatformRoutes({ app, platform })
  attachPreviewRoutes({
    app,
    platform,
    definitions,
    pushController,
  })
  const request = (path: string) =>
    app.request(path, {
      headers: { Authorization: "Bearer fixture-token" },
    })
  return {
    app,
    platform,
    publisher,
    devices,
    definitions,
    pushController,
    renderPreview,
    request,
  }
}

test("profiles merge identical settings but retain rotation and capabilities", async () => {
  const { platform, definitions, pushController } =
    await fixture()
  const profiles = getPreviewProfiles({
    platform,
    definitions,
    pushController,
  })
  expect(profiles).toHaveLength(2)
  expect(profiles[0]?.deviceIds).toEqual(["one", "two"])
  expect(profiles[0]?.label).not.toMatch(
    /First panel|Second panel/,
  )
  expect(profiles[1]?.label).toContain("90°")
  expect(profiles[0]?.unsupportedViews.camera).toBeDefined()
})

test("image preview requires management authorization, coalesces renders, and never changes targets", async () => {
  const {
    app,
    request,
    platform,
    publisher,
    renderPreview,
  } = await fixture()
  const before = JSON.stringify(platform.store.get())
  expect(
    (
      await app.request(
        "/api/manage/previews/one/view/agenda",
      )
    ).status,
  ).toBe(401)
  const responses = await Promise.all([
    request("/api/manage/previews/one/view/agenda"),
    request("/api/manage/previews/one/view/agenda"),
  ])
  expect(
    responses.map((response) => response.status),
  ).toEqual([200, 200])
  expect(await responses[0]?.text()).toBe("fixture-png")
  expect(renderPreview).toHaveBeenCalledTimes(1)
  expect(renderPreview).toHaveBeenCalledWith({
    deviceId: "one",
    kind: "view",
    id: "agenda",
  })
  expect(JSON.stringify(platform.store.get())).toBe(before)
  expect(publisher.publish).not.toHaveBeenCalled()
  expect(
    (await request("/api/manage/previews/one/view/camera"))
      .status,
  ).toBe(422)
  expect(
    (
      await request(
        "/api/manage/previews/missing/view/agenda",
      )
    ).status,
  ).toBe(404)
  expect(renderPreview).toHaveBeenCalledTimes(1)
  await request(
    "/api/manage/previews/one/view/agenda?revision=1",
  )
  expect(renderPreview).toHaveBeenCalledTimes(2)
})

test("only an authenticated preview can use display properties without assignment", async () => {
  const { app, request } = await fixture()
  expect(
    (await request("/api/display/view/agenda?device=one"))
      .status,
  ).toBe(409)
  expect(
    (
      await app.request(
        "/api/display/view/agenda?device=one&preview=1",
      )
    ).status,
  ).toBe(409)
  const response = await request(
    "/api/display/view/agenda?device=one&preview=1",
  )
  expect(response.status).toBe(200)
  expect(
    (await response.json()).displayProperties.delivery,
  ).toBe("image")
})
