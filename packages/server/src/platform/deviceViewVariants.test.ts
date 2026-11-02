import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { PHAT_DEVICE } from "@castkit/core/devices/device"
import type { ViewDefinition } from "@castkit/sdk/contracts"
import type { DeviceViewOverrides } from "@castkit/shared/views/deviceViewOverrides"
import { Hono } from "hono"
import { expect, onTestFinished, test, vi } from "vitest"
import type {
  BrowserDeviceConfig,
  ConfiguredDevice,
} from "../config/env.ts"
import { parseDeviceDefinition } from "../config/env.ts"
import {
  DISPLAY_MEDIA_CONTEXT_KEYS,
  scopeDisplayMediaPlaylist,
} from "./displayMediaScope.ts"
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
const fixture = async ({
  isBrowser = false,
}: {
  isBrowser?: boolean
} = {}) => {
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
  const imageDevices: ConfiguredDevice[] = [
    "one",
    "two",
  ].map((id) => ({
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
  }))
  const browserDevices = isBrowser
    ? imageDevices.map(
        (device) =>
          parseDeviceDefinition({
            ...device,
            renderer: "browser",
            color: "full",
            hasTouch: true,
          }) as BrowserDeviceConfig,
      )
    : []
  const devices = isBrowser ? browserDevices : imageDevices
  const platform = await createPlatform({
    file,
    devices: isBrowser ? [] : imageDevices,
    browserDevices,
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
  return { platform, devices, request, channels, app }
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

test.each([
  "preview",
  "navigation",
])("customized media retains device scope through %s follow-up requests", async (mode) => {
  const { platform, devices, request, channels } =
    await fixture({ isBrowser: true })
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
  if (mode === "navigation") {
    platform.store.update((previous) => ({
      ...previous,
      deviceScreens: {},
    }))
    platform.setDeviceNavigationReader(() => ({
      url: "http://localhost/view/photos",
    }))
  }
  const modeQuery = mode === "preview" ? "&preview=1" : ""
  const snapshot = await (
    await request(
      `/api/display/view/photos?device=one${modeQuery}`,
    )
  ).json()
  const url =
    snapshot.channels["images/one"].data.images[0].url
  expect(url).toBe(
    `/api/display/view/photos/media/images%2Fone/asset?size=preview&device=one${modeQuery}`,
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

test.each([
  "preview",
  "capture",
  "preload",
  "capture-token",
])("customized HLS preserves %s scope through playlists and segments", async (mode) => {
  const { platform, devices, request, channels } =
    await fixture({ isBrowser: true })
  const cameraChannels = ["shared", "one"].map((id) => ({
    id: `cameras/${id}`,
    name: id,
    sourceId: "events",
    type: "cameras.v1",
    settings: {},
  }))
  platform.store.update((previous) => ({
    ...previous,
    channels: channels.concat(cameraChannels),
    views: previous.views.concat({
      ...points,
      id: "cameras",
      access: mode === "capture-token" ? "public" : "pin",
      panels: [
        {
          id: "main",
          specId: "cameras",
          bindings: { data: "cameras/shared" },
          settings: {},
        },
      ],
    }),
    deviceRecentViews: { one: ["cameras"] },
  }))
  const device = devices[0]
  if (!device) throw new Error("Missing fixture device")
  device.viewOverrides = {
    ...device.viewOverrides,
    cameras: {
      panels: {
        main: { bindings: { data: "cameras/one" } },
      },
    },
  }
  platform.validateDeviceViews()
  platform.hub.configure(platform.store.get().channels)
  platform.hub.publish({
    channelId: "cameras/one",
    data: {
      cameras: [
        {
          id: "camera.room",
          name: "Room camera",
          url: "/api/platform/channels/cameras%2Fone/media/camera.room?kind=hls",
          format: "hls",
        },
      ],
    },
  })
  if (mode === "capture-token") {
    platform.setDeviceCaptureReader((token) =>
      token === "fixture-capture"
        ? {
            deviceId: "one",
            target: { kind: "view", id: "cameras" },
          }
        : undefined,
    )
  }
  const captureQuery =
    mode === "capture-token"
      ? "capture=fixture-capture"
      : `${mode}=1`
  const snapshot = await (
    await request(
      `/api/display/view/cameras?device=one&${captureQuery}`,
      "GET",
      undefined,
      mode !== "capture-token",
    )
  ).json()
  const url = snapshot.channels["cameras/one"].data
    .cameras[0].url as string
  const media = vi
    .spyOn(platform.runtime, "getMedia")
    .mockImplementation(async ({ query }) => {
      const resource = query?.resource
      if (!resource)
        return new Response(
          "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000\n?kind=hls&session=fixture&resource=child.m3u8\n",
          {
            headers: {
              "content-type":
                "application/vnd.apple.mpegurl",
            },
          },
        )
      if (resource === "child.m3u8")
        return new Response(
          '#EXTM3U\n#EXT-X-MAP:URI="?kind=hls&session=fixture&resource=init.mp4"\n#EXT-X-PART:DURATION=1,URI="?kind=hls&session=fixture&resource=part.m4s"\n#EXTINF:1,\n?kind=hls&session=fixture&resource=segment.m4s\n',
          {
            headers: {
              "content-type": "application/x-mpegurl",
            },
          },
        )
      return new Response(`bytes:${resource}`, {
        headers: {
          "content-type":
            resource === "init.mp4"
              ? "video/mp4"
              : "video/iso.segment",
        },
      })
    })
  const follow = async (uri: string) => {
    const target = new URL(uri, `http://localhost${url}`)
    expect(target.searchParams.get("device")).toBe("one")
    expect(
      target.searchParams.get(
        mode === "capture-token" ? "capture" : mode,
      ),
    ).toBe(
      mode === "capture-token" ? "fixture-capture" : "1",
    )
    const response = await request(
      `${target.pathname}${target.search}`,
      "GET",
      undefined,
      mode !== "capture-token",
    )
    expect(response.status).toBe(200)
    return response.text()
  }
  const master = await follow(url)
  const childUri = master
    .split("\n")
    .find((line) => line && !line.startsWith("#"))
  expect(childUri).toBeDefined()
  const child = await follow(childUri ?? "")
  const attributes = Array.from(
    child.matchAll(/URI="([^"]+)"/g),
    (match) => match[1] ?? "",
  )
  expect(attributes).toHaveLength(2)
  expect(await follow(attributes[0] ?? "")).toBe(
    "bytes:init.mp4",
  )
  expect(await follow(attributes[1] ?? "")).toBe(
    "bytes:part.m4s",
  )
  const segment = child
    .split("\n")
    .find((line) => line && !line.startsWith("#"))
  expect(await follow(segment ?? "")).toBe(
    "bytes:segment.m4s",
  )
  expect(media).toHaveBeenCalledTimes(5)
  media.mock.calls.forEach(([options]) => {
    DISPLAY_MEDIA_CONTEXT_KEYS.forEach((key) => {
      expect(options.query).not.toHaveProperty(key)
    })
  })
  expect(
    (
      await request(
        mode === "capture-token"
          ? url.replace(
              "fixture-capture",
              "expired-capture",
            )
          : url,
        "GET",
        undefined,
        false,
      )
    ).status,
  ).toBeGreaterThanOrEqual(400)
})

test("playlist scoping preserves legacy, external, and other-channel URLs", () => {
  const playlist =
    '#EXTM3U\r\n#EXT-X-KEY:METHOD=AES-128,URI="https://media.example/key"\r\n/api/display/view/cameras/media/other/asset?kind=hls\r\n'
  const requestUrl =
    "http://localhost/api/display/view/cameras/media/cameras%2Fone/camera.room?kind=hls"
  expect(
    scopeDisplayMediaPlaylist({ playlist, requestUrl }),
  ).toBe(playlist)
  expect(
    scopeDisplayMediaPlaylist({
      playlist: playlist.replaceAll("\r", ""),
      requestUrl: `${requestUrl}&device=one&preview=1`,
    }),
  ).toBe(playlist.replaceAll("\r", ""))
})

test("playlist children use the caller's device and grant context", () => {
  const requestUrl =
    "http://localhost/api/display/view/cameras/media/cameras%2Fone/camera.room?kind=hls&device=one&capture=1"
  const playlist = scopeDisplayMediaPlaylist({
    playlist:
      "?kind=hls&device=wrong&preload=1&resource=child.m3u8",
    requestUrl,
  })
  const target = new URL(playlist, requestUrl)
  expect(target.searchParams.get("device")).toBe("one")
  expect(target.searchParams.get("capture")).toBe("1")
  expect(target.searchParams.has("preload")).toBe(false)
  expect(target.searchParams.get("resource")).toBe(
    "child.m3u8",
  )
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

test.each([
  "preview",
  "navigation",
])("%s controls resolve the customized channel and reject another room's player", async (mode) => {
  const { platform, devices, request, channels } =
    await fixture({ isBrowser: true })
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
  if (mode === "navigation") {
    platform.store.update((previous) => ({
      ...previous,
      deviceScreens: {},
    }))
    platform.setDeviceNavigationReader(() => ({
      url: "http://localhost/view/music",
    }))
  }
  const path = `/api/display/view/music/actions?device=one${mode === "preview" ? "&preview=1" : ""}`
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

test("manual foreground targets preserve device data, grants, override priority, and stale-target rejection", async () => {
  const { platform, request } = await fixture({
    isBrowser: true,
  })
  platform.store.update((previous) => ({
    ...previous,
    deviceScreens: {},
    deviceRecentViews: { one: ["points"] },
  }))
  const selection: {
    view:
      | {
          url: string
          zoom?: number
          isAvailable?: boolean
        }
      | undefined
  } = { view: { url: "http://localhost/view/points" } }
  platform.setDeviceNavigationReader(() => selection.view)
  const first = await (
    await request("/api/display/view/points?device=one")
  ).json()
  const second = await (
    await request("/api/display/view/points?device=two")
  ).json()
  expect(
    first.channels["points/one"].data.kids[0].pointsToday,
  ).toBe(100)
  expect(
    second.channels["points/two"].data.kids[0].pointsToday,
  ).toBe(200)
  expect(first.canControl).toBe(true)
  expect(
    (
      await request(
        "/api/display/view/points?device=one",
        "GET",
        undefined,
        false,
      )
    ).status,
  ).toBe(401)
  expect(
    (
      await (
        await request(
          "/api/display/view/points?device=one&preload=1",
        )
      ).json()
    ).canControl,
  ).toBe(false)
  platform.store.update((previous) => ({
    ...previous,
    views: previous.views.map((view) => ({
      ...view,
      isControlEnabled: false,
    })),
  }))
  expect(
    (
      await (
        await request("/api/display/view/points?device=one")
      ).json()
    ).canControl,
  ).toBe(false)
  selection.view = { url: "http://localhost/screen/shared" }
  expect(
    (
      await (
        await request(
          "/api/display/screen/shared?device=one",
        )
      ).json()
    ).channels,
  ).toHaveProperty("points/one")
  platform.showOnDevice({
    deviceId: "one",
    viewId: "points",
    durationSeconds: 30,
  })
  expect(
    (await request("/api/display/screen/shared?device=one"))
      .status,
  ).toBe(409)
  expect(
    (await request("/api/display/view/points?device=one"))
      .status,
  ).toBe(200)
})

test("capture tokens scope reads to one destination, preserve PINs, deny actions, and expire", async () => {
  const { platform, request } = await fixture({
    isBrowser: true,
  })
  platform.store.update((previous) => ({
    ...previous,
    deviceScreens: {},
  }))
  const capture = { isOpen: true }
  platform.setDeviceCaptureReader((token) =>
    capture.isOpen
      ? token === "fixture-capture"
        ? {
            deviceId: "one",
            target: { kind: "view", id: "points" },
          }
        : token === "fixture-screen"
          ? {
              deviceId: "one",
              target: { kind: "screen", id: "shared" },
            }
          : undefined
      : undefined,
  )
  const url =
    "/api/display/view/points?device=one&capture=fixture-capture"
  expect(
    (await request(url, "GET", undefined, false)).status,
  ).toBe(401)
  platform.store.update((previous) => ({
    ...previous,
    views: previous.views.map((view) => ({
      ...view,
      access: "public",
    })),
    screens: previous.screens.map((screen) => ({
      ...screen,
      access: "public",
    })),
  }))
  const snapshot = await (
    await request(url, "GET", undefined, false)
  ).json()
  expect(snapshot.channels).toHaveProperty("points/one")
  expect(snapshot.canControl).toBe(true)
  expect(
    (
      await request(
        url.replace("device=one", "device=two"),
        "GET",
        undefined,
        false,
      )
    ).status,
  ).toBe(409)
  expect(
    (
      await request(
        url.replace("/view/points", "/screen/shared"),
        "GET",
        undefined,
        false,
      )
    ).status,
  ).toBe(409)
  expect(
    (
      await request(
        "/api/display/view/points/actions?device=one&capture=fixture-capture",
        "POST",
        { panelId: "main", action: "play_pause" },
        false,
      )
    ).status,
  ).toBe(403)
  expect(
    (
      await request(
        "/api/display/screen/shared?device=one&capture=fixture-screen",
        "GET",
        undefined,
        false,
      )
    ).status,
  ).toBe(200)
  expect(
    (
      await request(
        "/api/display/screen/shared/select?device=one&capture=fixture-screen",
        "POST",
        { viewId: "points" },
        false,
      )
    ).status,
  ).toBe(403)
  capture.isOpen = false
  expect(
    (await request(url, "GET", undefined, false)).status,
  ).toBe(409)
})

test("foreground authorization retains the incoming host and port on synthetic WebSocket URLs", async () => {
  const { platform, app } = await fixture({
    isBrowser: true,
  })
  platform.store.update((previous) => ({
    ...previous,
    deviceScreens: {},
  }))
  platform.setDeviceNavigationReader(() => ({
    url: "http://display.example:8080/view/points",
  }))
  const response = await app.request(
    "http://localhost/api/display/view/points?device=one",
    {
      headers: {
        Host: "display.example:8080",
        Authorization: "Bearer fixture-token",
      },
    },
  )
  expect(response.status).toBe(200)
  expect((await response.json()).channels).toHaveProperty(
    "points/one",
  )
})

test.each([
  undefined,
  { url: "https://external.example/view/points" },
  { url: "http://localhost/view/points?preview=1" },
  { url: "http://localhost/view/points#section" },
  { url: "http://localhost/view/points", zoom: 2 },
  {
    url: "http://localhost/view/points",
    isAvailable: false,
  },
  { url: "http://localhost/view/%invalid" },
])("inactive or external foreground targets cannot grant device access: %j", async (selected) => {
  const { platform, request } = await fixture({
    isBrowser: true,
  })
  platform.store.update((previous) => ({
    ...previous,
    deviceScreens: {},
  }))
  platform.setDeviceNavigationReader(() => selected)
  expect(
    (await request("/api/display/view/points?device=one"))
      .status,
  ).toBe(409)
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
