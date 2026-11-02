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
  test("independent holds of one view preserve priority and clear only their owner", () => {
    const clock = { value: 0 }
    const overrides = createDeviceOverrides({
      now: () => clock.value,
    })
    const showManual = () =>
      overrides.show({
        deviceId: "panel",
        viewId: "points",
        overrideId: "manual",
        durationSeconds: 30,
        priority: 50,
        navigationId: "manual-navigation",
      })
    overrides.show({
      deviceId: "panel",
      viewId: "points",
      durationSeconds: 90,
      priority: 100,
      navigationId: "genuine-navigation",
    })
    showManual()
    expect(overrides.getActive("panel")).toMatchObject({
      priority: 100,
      expiresAt: 90000,
      navigationId: "genuine-navigation",
    })
    overrides.clear({
      deviceId: "panel",
      viewId: "points",
      overrideId: "manual",
    })
    expect(overrides.getActive("panel")?.priority).toBe(100)
    showManual()
    overrides.clear({ deviceId: "other", viewId: "points" })
    expect(overrides.getActive("panel")?.priority).toBe(100)
    overrides.clear({ deviceId: "panel", viewId: "points" })
    expect(overrides.getActive("panel")).toMatchObject({
      priority: 50,
      overrideId: "manual",
      navigationId: "manual-navigation",
    })
    overrides.show({
      deviceId: "panel",
      viewId: "points",
      durationSeconds: 90,
      priority: 100,
    })
    expect(overrides.getActive("panel")?.priority).toBe(100)
    overrides.clear({ deviceId: "panel", viewId: "points" })
    expect(overrides.getActive("panel")?.overrideId).toBe(
      "manual",
    )
    clock.value = 31000
    expect(overrides.getActive("panel")).toBeUndefined()
    overrides.dispose()
  })

  test("a named owner changes its view without a stale dismissal clearing the new hold", () => {
    const overrides = createDeviceOverrides()
    overrides.show({
      deviceId: "panel",
      viewId: "first",
      overrideId: "manual",
      durationSeconds: 30,
      priority: 100,
    })
    overrides.show({
      deviceId: "panel",
      viewId: "second",
      overrideId: "manual",
      durationSeconds: 60,
      priority: 50,
    })
    overrides.clear({
      deviceId: "panel",
      viewId: "first",
      overrideId: "manual",
    })
    expect(overrides.getViewId("panel")).toBe("second")
    overrides.clear({
      deviceId: "panel",
      viewId: "second",
      overrideId: "manual",
    })
    expect(overrides.getViewId("panel")).toBeUndefined()
    overrides.dispose()
  })

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
  repaint: "instant" | "fast" | "slow" | "super-slow"
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
    apiToken: "test-machine-token",
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
      imageDevice({ id: "quick", repaint: "fast" }),
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
  attachPlatformRoutes({
    app,
    platform,
    apiToken: "test-machine-token",
  })
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
  test("HTTP and MQTT preserve independent owners of the same view", async () => {
    const { platform, app, deliver } = await createFixture()
    const request = (method: string, body: unknown) =>
      app.request(
        "/api/manage/platform/devices/desk/show",
        {
          method,
          headers: {
            "content-type": "application/json",
            authorization: "Bearer test-machine-token",
          },
          body: JSON.stringify(body),
        },
      )
    const showManual = () =>
      request("POST", {
        viewId: "points",
        overrideId: "manual",
        durationSeconds: 30,
        priority: 50,
      })
    await deliver(
      "castkit/desk/override/set",
      JSON.stringify({
        viewId: "points",
        durationSeconds: 90,
        priority: 100,
      }),
    )
    expect((await showManual()).status).toBe(200)
    expect(
      platform.deviceOverrides.getActive("desk")?.priority,
    ).toBe(100)
    expect(
      (
        await request("DELETE", {
          viewId: "points",
          overrideId: "manual",
        })
      ).status,
    ).toBe(200)
    expect(
      platform.deviceOverrides.getActive("desk")?.priority,
    ).toBe(100)
    expect((await showManual()).status).toBe(200)
    await deliver(
      "castkit/desk/override/clear",
      JSON.stringify({ viewId: "points" }),
    )
    expect(
      platform.deviceOverrides.getActive("desk")
        ?.overrideId,
    ).toBe("manual")
    await deliver(
      "castkit/desk/override/clear",
      JSON.stringify({
        viewId: "points",
        overrideId: "manual",
      }),
    )
    expect(platform.getDeviceTarget("desk")?.id).toBe(
      "desk-screen",
    )
    await deliver(
      "castkit/desk/override/set",
      JSON.stringify({
        viewId: "points",
        overrideId: "manual",
        durationSeconds: 30,
      }),
    )
    expect(
      platform.deviceOverrides.getActive("desk")
        ?.overrideId,
    ).toBe("manual")
  })

  test("invalid owner IDs cannot create or dismiss a hold", async () => {
    const { platform, app, deliver } = await createFixture()
    platform.showOnDevice({
      deviceId: "desk",
      viewId: "points",
      overrideId: "manual",
      durationSeconds: 30,
    })
    const statuses = await Promise.all(
      [null, "", 42, "a".repeat(129)].flatMap(
        (overrideId) =>
          ["POST", "DELETE"].map(
            async (method) =>
              (
                await app.request(
                  "/api/manage/platform/devices/desk/show",
                  {
                    method,
                    headers: {
                      "content-type": "application/json",
                      authorization:
                        "Bearer test-machine-token",
                    },
                    body: JSON.stringify({
                      viewId: "points",
                      overrideId,
                      durationSeconds: 30,
                    }),
                  },
                )
              ).status,
          ),
      ),
    )
    expect(statuses).toEqual(
      Array.from({ length: 8 }, () => 400),
    )
    const warn = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {})
    await deliver(
      "castkit/desk/override/clear",
      JSON.stringify({ viewId: "points", overrideId: "" }),
    )
    await deliver(
      "castkit/desk/override/set",
      JSON.stringify({
        viewId: "points",
        overrideId: 42,
        durationSeconds: 30,
        priority: 100,
      }),
    )
    expect(warn).toHaveBeenCalledTimes(2)
    expect(
      platform.deviceOverrides.getActive("desk")
        ?.overrideId,
    ).toBe("manual")
    warn.mockRestore()
  })

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

  test("a timer ending dismisses only its own view through MQTT", async () => {
    const { platform, deliver } = await createFixture()
    platform.showOnDevice({
      deviceId: "desk",
      viewId: "points",
      durationSeconds: 60,
      priority: 100,
    })
    await deliver(
      "castkit/desk/override/clear",
      JSON.stringify({ viewId: "unrelated" }),
    )
    expect(platform.getDeviceTarget("desk")?.id).toBe(
      "points",
    )
    await deliver(
      "castkit/desk/override/clear",
      JSON.stringify({ viewId: "points" }),
    )
    expect(platform.getDeviceTarget("desk")).toEqual({
      kind: "screen",
      id: "desk-screen",
    })
  })

  test("management dismisses the named view and validates the request", async () => {
    const { platform, app } = await createFixture()
    platform.showOnDevice({
      deviceId: "desk",
      viewId: "points",
      durationSeconds: 60,
    })
    const request = (deviceId: string, body: unknown) =>
      app.request(
        `/api/manage/platform/devices/${deviceId}/show`,
        {
          method: "DELETE",
          headers: {
            "content-type": "application/json",
            authorization: "Bearer test-machine-token",
          },
          body: JSON.stringify(body),
        },
      )
    expect((await request("desk", {})).status).toBe(400)
    expect(
      (await request("missing", { viewId: "points" }))
        .status,
    ).toBe(404)
    expect(
      (await request("desk", { viewId: "points" })).status,
    ).toBe(200)
    expect(platform.getDeviceTarget("desk")).toEqual({
      kind: "screen",
      id: "desk-screen",
    })
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

test("temporary screen tests preserve assignments, allow alerts, and dismiss only their own test", async () => {
  const { platform, app } = await createFixture()
  const headers = {
    Authorization: "Bearer test-machine-token",
    "Content-Type": "application/json",
  }
  const path = "/api/manage/platform/devices/desk/test"
  expect(
    (
      await app.request(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: { kind: "view", id: "points" },
          durationSeconds: 60,
        }),
      })
    ).status,
  ).toBe(401)
  const start = await app.request(path, {
    method: "POST",
    headers,
    body: JSON.stringify({
      target: { kind: "view", id: "points" },
      durationSeconds: 60,
    }),
  })
  expect(start.status).toBe(200)
  const first = (await start.json()).test
  const contrast = await app.request(path, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      testId: first.testId,
      contrast: "high",
    }),
  })
  expect(contrast.status).toBe(200)
  expect((await contrast.json()).test.expiresAt).toBe(
    first.expiresAt,
  )
  expect(
    platform.getDeviceProperties("desk")?.contrast,
  ).toBe("high")

  const darker = await app.request(path, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      testId: first.testId,
      contrast: "darker",
    }),
  })
  expect(darker.status).toBe(200)
  expect((await darker.json()).test.expiresAt).toBe(
    first.expiresAt,
  )
  expect(
    platform.getDeviceProperties("desk")?.contrast,
  ).toBe("darker")
  expect(
    platform.getDeviceProperties("mantle")?.contrast,
  ).toBe("standard")

  expect(platform.getDeviceTarget("desk")).toEqual({
    kind: "view",
    id: "points",
  })
  expect(platform.store.get().deviceScreens).toEqual({
    desk: "desk-screen",
  })
  platform.showOnDevice({
    deviceId: "desk",
    viewId: "home",
    durationSeconds: 60,
    priority: 100,
  })
  expect(platform.getDeviceTarget("desk")).toEqual({
    kind: "view",
    id: "home",
  })
  expect(
    (await (await app.request(path, { headers })).json())
      .isShowing,
  ).toBe(false)
  platform.deviceOverrides.clear({
    deviceId: "desk",
    viewId: "home",
  })
  expect(platform.getDeviceTarget("desk")).toEqual({
    kind: "view",
    id: "points",
  })
  const second = platform.testOnDevice({
    deviceId: "desk",
    target: { kind: "screen", id: "desk-screen" },
    durationSeconds: 60,
  })
  await app.request(path, {
    method: "DELETE",
    headers,
    body: JSON.stringify({ testId: first.testId }),
  })
  expect(platform.deviceTests.get("desk")?.testId).toBe(
    second.testId,
  )
  await app.request(path, {
    method: "DELETE",
    headers,
    body: JSON.stringify({ testId: second.testId }),
  })
  expect(platform.deviceTests.get("desk")).toBeNull()
  expect(
    platform.getDeviceProperties("desk")?.contrast,
  ).toBe("standard")
  expect(
    (
      await app.request(path, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          testId: first.testId,
          contrast: "high",
        }),
      })
    ).status,
  ).toBe(409)

  expect(platform.getDeviceTarget("desk")).toEqual({
    kind: "screen",
    id: "desk-screen",
  })
  expect(() =>
    platform.testOnDevice({
      deviceId: "mantle",
      target: { kind: "view", id: "points" },
      durationSeconds: 60,
    }),
  ).toThrow("super-slow")
  expect(() =>
    platform.testOnDevice({
      deviceId: "desk",
      target: { kind: "screen", id: "missing" },
      durationSeconds: 60,
    }),
  ).toThrow("Unknown")
  expect(
    (
      await app.request(path, {
        method: "POST",
        headers,
        body: JSON.stringify({
          target: { kind: "view", id: "points" },
          durationSeconds: 3601,
        }),
      })
    ).status,
  ).toBe(400)
})

test("override correlation belongs to the winning selection and never changes priority", () => {
  const overrides = createDeviceOverrides()
  overrides.show({
    deviceId: "panel",
    viewId: "music",
    durationSeconds: 30,
    priority: 50,
    navigationId: "swipe-two",
  })
  expect(overrides.getActive("panel")?.navigationId).toBe(
    "swipe-two",
  )
  overrides.show({
    deviceId: "panel",
    viewId: "doorbell",
    durationSeconds: 30,
    priority: 100,
  })
  expect(overrides.getActive("panel")?.viewId).toBe(
    "doorbell",
  )
  expect(
    overrides.getActive("panel")?.navigationId,
  ).toBeUndefined()
  overrides.dispose()
})

test("room timers select fast displays, respect manual overrides, and return when cleared", async () => {
  const { platform } = await createFixture()
  const view: ViewDefinition = {
    ...pointsView,
    id: "room-timers",
    panels: [
      {
        id: "timers",
        specId: "timers",
        bindings: { data: "timers" },
        settings: {
          presentation: "priority",
          room: "lounge",
          automaticDeviceIds: "quick,desk",
        },
      },
    ],
  }
  platform.store.update((previous) => ({
    ...previous,
    views: [...previous.views, view],
  }))
  platform.hub.configure([
    {
      id: "timers",
      name: "Timers",
      type: "entities.v1",
      sourceId: "test",
      settings: {},
    },
  ])
  const entity = {
    id: "timer.one",
    domain: "timer",
    name: "Tea",
    state: "active",
    attributes: {
      room: "study",
      finishes_at: new Date(
        Date.now() + 60000,
      ).toISOString(),
    },
    actions: ["pause", "cancel"],
  }
  platform.hub.publish({
    channelId: "timers",
    data: { entities: [entity] },
  })
  expect(platform.getDeviceTarget("quick")).toBeUndefined()
  platform.hub.publish({
    channelId: "timers",
    data: {
      entities: [
        {
          ...entity,
          attributes: {
            ...entity.attributes,
            room: "lounge",
          },
        },
      ],
    },
  })
  expect(platform.getDeviceTarget("quick")).toEqual({
    kind: "view",
    id: "room-timers",
  })
  expect(platform.getDeviceTarget("desk")).toEqual({
    kind: "screen",
    id: "desk-screen",
  })
  platform.showOnDevice({
    deviceId: "quick",
    viewId: "points",
    durationSeconds: 30,
    priority: 100,
  })
  expect(platform.getDeviceTarget("quick")).toEqual({
    kind: "view",
    id: "points",
  })
  platform.deviceOverrides.clear({
    deviceId: "quick",
    viewId: "points",
  })
  platform.hub.publish({
    channelId: "timers",
    data: { entities: [] },
  })
  expect(platform.getDeviceTarget("quick")).toBeUndefined()
})
