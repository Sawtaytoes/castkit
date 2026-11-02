import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { PHAT_DEVICE } from "@castkit/core/devices/device"
import type { ViewDefinition } from "@castkit/sdk/contracts"
import type { DeviceViewOverrides } from "@castkit/shared/views/deviceViewOverrides"
import { Hono } from "hono"
import { expect, onTestFinished, test, vi } from "vitest"
import type { ConfiguredDevice } from "../config/env.ts"
import { parseDeviceDefinition } from "../config/env.ts"
import { createPlatform } from "./platform.ts"
import { readPlatformFrameKey } from "./platformFrameKey.ts"
import { attachPlatformRoutes } from "./platformRoutes.ts"
import { createPlatformStore } from "./platformStore.ts"

const points: ViewDefinition = {
  id: "points",
  name: "Tally Marks",
  layout: "single",
  theme: "light",
  access: "pin",
  isControlEnabled: true,
  panels: [
    {
      id: "main",
      specId: "kids-points",
      bindings: { data: "points/shared" },
      settings: { isTotalsOnly: true },
    },
  ],
}
const fixture = async () => {
  const directory = mkdtempSync(
    join(tmpdir(), "castkit-device-variants-"),
  )
  onTestFinished(() =>
    rmSync(directory, { recursive: true, force: true }),
  )
  const file = join(directory, "platform.json")
  const store = createPlatformStore({ file })
  const channels = ["shared", "one", "two"].map((id) => ({
    id: `points/${id}`,
    name: id,
    sourceId: "events",
    type: "kids-points.v1",
    settings: {},
  }))
  store.update((previous) => ({
    ...previous,
    sources: [
      {
        id: "events",
        name: "Events",
        adapter: "mqtt",
        settings: {},
        isEnabled: false,
      },
    ],
    channels,
    views: [points],
    screens: [
      {
        id: "shared",
        name: "Shared",
        viewIds: ["points"],
        defaultViewId: "points",
        access: "pin",
      },
    ],
    deviceScreens: { one: "shared", two: "shared" },
  }))
  const devices: ConfiguredDevice[] = ["one", "two"].map(
    (id) => ({
      ...PHAT_DEVICE,
      id,
      width: 200,
      height: 200,
      viewOverrides: {
        points: {
          panels: {
            main: { bindings: { data: `points/${id}` } },
          },
        },
      },
    }),
  )
  const platform = await createPlatform({
    file,
    devices,
    apiToken: "fixture-token",
    publisher: {
      isEnabled: false,
      publish: async () => {},
      subscribe: async () => {},
      close: async () => {},
    },
  })
  onTestFinished(() => platform.dispose())
  platform.hub.configure(channels)
  channels.forEach((channel, index) => {
    platform.hub.publish({
      channelId: channel.id,
      data: {
        kids: [
          {
            id: "robin",
            name: "Robin",
            pointsToday: index * 100,
            goal: 400,
          },
        ],
      },
    })
  })
  const app = new Hono()
  attachPlatformRoutes({
    app,
    platform,
    apiToken: "fixture-token",
  })
  const request = (
    path: string,
    method = "GET",
    body?: unknown,
    isAuthenticated = true,
  ) =>
    app.request(path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(isAuthenticated
          ? { Authorization: "Bearer fixture-token" }
          : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  return { platform, devices, request, channels }
}

test("the same saved view resolves room inputs before snapshots and frame keys", async () => {
  const { platform, request } = await fixture()
  const first = await (
    await request("/api/display/screen/shared?device=one")
  ).json()
  const second = await (
    await request("/api/display/screen/shared?device=two")
  ).json()
  expect(first.view.id).toBe(second.view.id)
  expect(Object.keys(first.channels)).toEqual([
    "points/one",
  ])
  expect(Object.keys(second.channels)).toEqual([
    "points/two",
  ])
  expect(
    first.channels["points/one"].data.kids[0].pointsToday,
  ).toBe(100)
  expect(
    second.channels["points/two"].data.kids[0].pointsToday,
  ).toBe(200)
  const firstKey = readPlatformFrameKey({
    platform,
    deviceId: "one",
    now: Date.now(),
  })
  const secondKey = readPlatformFrameKey({
    platform,
    deviceId: "two",
    now: Date.now(),
  })
  expect(firstKey).toBeDefined()
  expect(secondKey).toBeDefined()
  expect(firstKey).not.toBe(secondKey)
  expect(platform.store.get().views[0]).toEqual(points)
  expect(
    platform.getTarget({ kind: "view", id: "points" })?.view
      .panels[0]?.bindings.data,
  ).toBe("points/shared")
})

test("different settings cannot share a frame even with identical geometry and bound data", async () => {
  const { platform, devices } = await fixture()
  const second =
    devices[1]?.viewOverrides?.points?.panels.main
  if (!second)
    throw new Error("Missing fixture customization")
  second.bindings = { data: "points/one" }
  second.settings = { isTotalsOnly: false }
  const firstKey = readPlatformFrameKey({
    platform,
    deviceId: "one",
    now: Date.now(),
  })
  const secondKey = readPlatformFrameKey({
    platform,
    deviceId: "two",
    now: Date.now(),
  })
  expect(firstKey).toBeDefined()
  expect(secondKey).toBeDefined()
  expect(firstKey).not.toBe(secondKey)
})

test("customized media retains device and preview scope through the follow-up request", async () => {
  const { platform, devices, request, channels } =
    await fixture()
  const imageChannels = ["shared", "one"].map((id) => ({
    id: `images/${id}`,
    name: id,
    sourceId: "events",
    type: "images.v1",
    settings: {},
  }))
  platform.store.update((previous) => ({
    ...previous,
    channels: channels.concat(imageChannels),
    views: previous.views.concat({
      ...points,
      id: "photos",
      panels: [
        {
          id: "main",
          specId: "photo-frame",
          bindings: { data: "images/shared" },
          settings: {},
        },
      ],
    }),
  }))
  const device = devices[0]
  if (!device) throw new Error("Missing fixture device")
  device.viewOverrides = {
    ...device.viewOverrides,
    photos: {
      panels: {
        main: { bindings: { data: "images/one" } },
      },
    },
  }
  platform.validateDeviceViews()
  platform.hub.configure(platform.store.get().channels)
  platform.hub.publish({
    channelId: "images/one",
    data: {
      images: [
        {
          id: "asset",
          url: "/api/platform/channels/images%2Fone/media/asset?size=preview",
        },
      ],
    },
  })
  const snapshot = await (
    await request(
      "/api/display/view/photos?device=one&preview=1",
    )
  ).json()
  const url =
    snapshot.channels["images/one"].data.images[0].url
  expect(url).toBe(
    "/api/display/view/photos/media/images%2Fone/asset?size=preview&device=one&preview=1",
  )
  const media = vi
    .spyOn(platform.runtime, "getMedia")
    .mockResolvedValue(
      new Response("fixture-image", {
        headers: { "content-type": "image/png" },
      }),
    )
  expect((await request(url)).status).toBe(200)
  expect(media).toHaveBeenCalledWith(
    expect.objectContaining({
      channelId: "images/one",
      assetId: "asset",
      query: { size: "preview" },
    }),
  )
  expect(
    (
      await request(
        "/api/display/view/photos/media/images%2Fone/asset",
      )
    ).status,
  ).toBe(403)
})

test("a later scan in a second room cannot replace the first room's feedback", async () => {
  const { platform, request } = await fixture()
  const scan = (reader: string, atMs: number) => ({
    kids: [
      {
        id: "robin",
        name: "Robin",
        pointsToday: 100,
        goal: 400,
      },
    ],
    lastScan: {
      kidId: "robin",
      reader,
      atMs,
      result: "awarded",
      taskName: "Reading",
      points: 10,
    },
  })
  platform.hub.publish({
    channelId: "points/one",
    data: scan("First reader", Date.now() - 1000),
  })
  platform.hub.publish({
    channelId: "points/two",
    data: scan("Second reader", Date.now()),
  })
  expect(platform.hub.get("points/one")?.status).toBe(
    "ready",
  )
  const first = await (
    await request("/api/display/screen/shared?device=one")
  ).json()
  const second = await (
    await request("/api/display/screen/shared?device=two")
  ).json()
  expect(
    first.channels["points/one"].data.lastScan.reader,
  ).toBe("First reader")
  expect(
    second.channels["points/two"].data.lastScan.reader,
  ).toBe("Second reader")
})

test("shared changes apply while explicit device changes and access remain inherited", async () => {
  const { platform, devices, request } = await fixture()
  const customization = devices[0]?.viewOverrides?.points
  const panel = customization?.panels.main
  if (!customization || !panel)
    throw new Error("Missing fixture customization")
  Object.assign(customization, {
    name: "Tally Marks · Practice",
  })
  Object.assign(panel, {
    settings: { isTotalsOnly: false },
  })
  const updated = {
    ...points,
    name: "Tally Marks Shared",
    theme: "dark",
    isControlEnabled: false,
    panels: points.panels.map((panel) => ({
      ...panel,
      settings: { isTotalsOnly: true, scanSeconds: 45 },
    })),
  }
  const saved = await request(
    "/api/manage/platform/views/points",
    "PUT",
    updated,
  )
  expect(saved.status).toBe(200)
  const customized = platform.getTarget({
    kind: "view",
    id: "points",
    deviceId: "one",
  })?.view
  expect(customized).toMatchObject({
    name: "Tally Marks · Practice",
    theme: "dark",
    access: "pin",
    isControlEnabled: false,
    panels: [
      {
        settings: { isTotalsOnly: false, scanSeconds: 45 },
      },
    ],
  })
  expect(
    (
      await request(
        "/api/display/screen/shared?device=one",
        "GET",
        undefined,
        false,
      )
    ).status,
  ).toBe(401)
  panel.bindings = {}
  delete panel.settings
  expect(
    platform.getTarget({
      kind: "view",
      id: "points",
      deviceId: "one",
    })?.view.panels[0],
  ).toMatchObject({
    bindings: { data: "points/shared" },
    settings: { isTotalsOnly: true, scanSeconds: 45 },
  })
})

test("base edits and deletions cannot invalidate a saved device customization", async () => {
  const { platform, request } = await fixture()
  expect(
    (
      await request(
        "/api/manage/platform/views/points",
        "PUT",
        {
          ...points,
          panels: [{ ...points.panels[0], id: "renamed" }],
        },
      )
    ).status,
  ).toBe(400)
  expect(
    (
      await request(
        "/api/manage/platform/channels/points%2Fone",
        "DELETE",
      )
    ).status,
  ).toBe(409)
  expect(
    (
      await request(
        "/api/manage/platform/channels/points%2Fone",
        "PUT",
        {
          id: "points/one",
          name: "Wrong",
          sourceId: "events",
          type: "entities.v1",
          settings: {},
        },
      )
    ).status,
  ).toBe(400)
  expect(platform.store.get().views[0]?.panels[0]?.id).toBe(
    "main",
  )
})

test.each<DeviceViewOverrides>([
  { unknown: { panels: {} } },
  {
    points: {
      panels: { main: { bindings: { data: "" } } },
    },
  },
  { points: { panels: { missing: { settings: {} } } } },
  {
    points: {
      panels: { main: { bindings: { unknown: "" } } },
    },
  },
  {
    points: {
      panels: { main: { bindings: { data: "missing" } } },
    },
  },
  {
    points: {
      panels: {
        main: { settings: { isControlEnabled: true } },
      },
    },
  },
])("rejects invalid customization metadata before it is saved: %j", async (viewOverrides) => {
  const { platform, devices } = await fixture()
  const device = devices[0]
  if (!device) throw new Error("Missing fixture device")
  expect(() =>
    platform.validateDeviceViews({
      definitions: [{ ...device, viewOverrides }],
    }),
  ).toThrow()
})

test("scan expiry observes a channel used only by a device variant", async () => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "Date"],
  })
  onTestFinished(() => {
    vi.useRealTimers()
  })
  const { platform, devices } = await fixture()
  const panel =
    devices[0]?.viewOverrides?.points?.panels.main
  if (!panel) throw new Error("Missing fixture panel")
  panel.settings = { scanSeconds: 7 }
  const notified = vi.fn()
  platform.subscribe(notified)
  platform.hub.publish({
    channelId: "points/one",
    data: {
      kids: [
        {
          id: "robin",
          name: "Robin",
          pointsToday: 100,
          goal: 400,
        },
      ],
      lastScan: {
        kidId: "robin",
        reader: "First reader",
        atMs: Date.now(),
        result: "awarded",
        points: 10,
      },
    },
  })
  notified.mockClear()
  await vi.advanceTimersByTimeAsync(7001)
  expect(notified).toHaveBeenCalledOnce()
})

test("controls resolve the customized channel and reject another room's player", async () => {
  const { platform, devices, request, channels } =
    await fixture()
  const musicChannels = ["shared", "one"].map((id) => ({
    id: `music/${id}`,
    name: id,
    sourceId: "events",
    type: "now-playing.v1",
    settings: {},
  }))
  platform.store.update((previous) => ({
    ...previous,
    channels: channels.concat(musicChannels),
    views: previous.views.concat({
      ...points,
      id: "music",
      panels: [
        {
          id: "main",
          specId: "now-playing",
          bindings: { data: "music/shared" },
          settings: {},
        },
      ],
    }),
  }))
  const device = devices[0]
  if (!device) throw new Error("Missing fixture device")
  device.viewOverrides = {
    ...device.viewOverrides,
    music: {
      panels: { main: { bindings: { data: "music/one" } } },
    },
  }
  platform.validateDeviceViews()
  platform.hub.configure(platform.store.get().channels)
  musicChannels.forEach((channel) => {
    platform.hub.publish({
      channelId: channel.id,
      data: {
        title: "Fixture track",
        artist: "Fixture artist",
        isPlaying: true,
        entityId:
          channel.id === "music/one"
            ? "media_player.one"
            : "media_player.shared",
      },
    })
  })
  const execute = vi
    .spyOn(platform.runtime, "executeAction")
    .mockResolvedValue(undefined)
  const path =
    "/api/display/view/music/actions?device=one&preview=1"
  expect(
    (
      await request(path, "POST", {
        panelId: "main",
        action: "play_pause",
        payload: { entityId: "media_player.shared" },
      })
    ).status,
  ).toBe(400)
  expect(execute).not.toHaveBeenCalled()
  expect(
    (
      await request(path, "POST", {
        panelId: "main",
        action: "play_pause",
        payload: { entityId: "media_player.one" },
      })
    ).status,
  ).toBe(200)
  expect(execute).toHaveBeenCalledWith({
    channelId: "music/one",
    action: "play_pause",
    payload: { entityId: "media_player.one" },
  })
})

test.each([
  "access",
  "isControlEnabled",
  "layout",
  "specId",
])("the device schema refuses a top-level %s override", (key) => {
  expect(() =>
    parseDeviceDefinition({
      ...PHAT_DEVICE,
      viewOverrides: {
        points: {
          panels: {},
          [key]:
            key === "isControlEnabled" ? true : "public",
        },
      },
    }),
  ).toThrow()
})
