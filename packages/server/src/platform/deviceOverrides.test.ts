import { MONOCHROME_PALETTE } from "@castkit/core/panels/palette"
import type { ViewDefinition } from "@castkit/sdk/contracts"
import { Hono } from "hono"
import {
  afterEach,
  describe,
  expect,
  test,
  vi,
} from "vitest"
import { createDeviceOverrides } from "./deviceOverrides.ts"
import {
  createPlatform,
  type Platform,
} from "./platform.ts"
import { attachPlatformRoutes } from "./platformRoutes.ts"

describe("createDeviceOverrides", () => {
  test("the highest priority wins, then the latest, until each expires", () => {
    const clock = { value: 0 }
    const overrides = createDeviceOverrides({
      now: () => clock.value,
    })
    overrides.show({
      deviceId: "panel",
      viewId: "doorbell",
      durationSeconds: 60,
      priority: 200,
    })
    overrides.show({
      deviceId: "panel",
      viewId: "points",
      durationSeconds: 15,
      priority: 100,
    })
    expect(overrides.getViewId("panel")).toBe("doorbell")
    expect(overrides.getViewId("other")).toBeUndefined()
    clock.value = 61_000
    expect(overrides.getViewId("panel")).toBeUndefined()
    overrides.dispose()
  })

  test("refuses a duration or priority out of range", () => {
    const overrides = createDeviceOverrides()
    expect(() =>
      overrides.show({
        deviceId: "panel",
        viewId: "points",
        durationSeconds: 0,
      }),
    ).toThrow("Invalid display override")
    overrides.dispose()
  })
})

const runtimes = new Set<Platform>()
afterEach(() => {
  runtimes.forEach((runtime) => {
    runtime.dispose()
  })
  runtimes.clear()
})

const imageDevice = ({
  id,
  repaint,
}: {
  id: string
  repaint: "slow" | "super-slow"
}) => ({
  id,
  label: id,
  mac: "02:00:00:00:00:01",
  width: 400,
  height: 300,
  colorMode: "monochrome" as const,
  palette: MONOCHROME_PALETTE,
  rotation: 0 as const,
  ditherProfile: {
    algorithm: "off" as const,
    supersampleFactor: 1,
  },
  repaint,
  power: "wired" as const,
})

const pointsView: ViewDefinition = {
  id: "points",
  name: "Points",
  layout: "single",
  panels: [
    {
      id: "main",
      specId: "kids-points",
      bindings: {},
      settings: {},
    },
  ],
  theme: "auto",
  access: "public",
  isControlEnabled: false,
}

const createFixture = async () => {
  const handlers: ((message: {
    topic: string
    payload: string
  }) => Promise<void> | void)[] = []
  const platform = await createPlatform({
    publisher: {
      isEnabled: true,
      publish: async () => {},
      subscribe: async ({ handler }) => {
        handlers.push(handler)
      },
      close: async () => {},
    },
    devices: [
      imageDevice({ id: "desk", repaint: "slow" }),
      imageDevice({ id: "mantle", repaint: "super-slow" }),
    ],
  })
  runtimes.add(platform)
  platform.store.update((previous) => ({
    ...previous,
    views: [
      pointsView,
      { ...pointsView, id: "home", name: "Home" },
    ],
    screens: [
      {
        id: "desk-screen",
        name: "Desk",
        defaultViewId: "home",
        viewIds: ["home"],
        access: "public",
      },
    ],
    deviceScreens: { desk: "desk-screen" },
  }))
  const app = new Hono()
  attachPlatformRoutes({ app, platform })
  const deliver = async (
    topic: string,
    payload: string,
  ) => {
    await Promise.all(
      handlers.map((handler) =>
        handler({ topic, payload }),
      ),
    )
  }
  return { platform, app, deliver }
}

describe("a temporary view on one display", () => {
  test("covers the assigned screen and gives a slow display ten repaints", async () => {
    const { platform } = await createFixture()
    expect(platform.getDeviceTarget("desk")).toEqual({
      kind: "screen",
      id: "desk-screen",
    })
    expect(
      platform.showOnDevice({
        deviceId: "desk",
        viewId: "points",
        durationSeconds: 15,
        priority: 100,
      }),
    ).toBe(30)
    expect(platform.getDeviceTarget("desk")).toEqual({
      kind: "view",
      id: "points",
    })
  })

  test("a super-slow display refuses it", async () => {
    const { platform } = await createFixture()
    expect(() =>
      platform.showOnDevice({
        deviceId: "mantle",
        viewId: "points",
        durationSeconds: 15,
      }),
    ).toThrow("super-slow")
    expect(
      platform.getDeviceTarget("mantle"),
    ).toBeUndefined()
  })

  test("arrives over MQTT and ignores other topics", async () => {
    const { platform, deliver } = await createFixture()
    await deliver(
      "castkit/desk/override/set",
      JSON.stringify({
        viewId: "points",
        durationSeconds: 15,
      }),
    )
    expect(platform.getDeviceTarget("desk")?.id).toBe(
      "points",
    )
    const warn = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {})
    await deliver("castkit/desk/override/set", "not json")
    await deliver(
      "castkit/mantle/view/set",
      JSON.stringify({
        viewId: "points",
        durationSeconds: 15,
      }),
    )
    expect(warn).toHaveBeenCalledOnce()
    expect(
      platform.getDeviceTarget("mantle"),
    ).toBeUndefined()
    warn.mockRestore()
  })

  test("the display's page follows it, and the old target asks for a reload", async () => {
    const { platform, app } = await createFixture()
    platform.showOnDevice({
      deviceId: "desk",
      viewId: "points",
      durationSeconds: 15,
    })
    expect(
      (
        await app.request(
          "/api/display/view/points?device=desk",
        )
      ).status,
    ).toBe(200)
    const stale = await app.request(
      "/api/display/screen/desk-screen?device=desk",
    )
    expect(stale.status).toBe(409)
  })

  test("the management API reports the seconds granted", async () => {
    const { platform, app } = await createFixture()
    const response = await app.request(
      "/api/manage/platform/devices/desk/show",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-castkit-render-key": platform.renderKey,
        },
        body: JSON.stringify({
          viewId: "points",
          durationSeconds: 15,
        }),
      },
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ok: true,
      durationSeconds: 30,
    })
  })
})
