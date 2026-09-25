import type {
  ChannelDefinition,
  ViewDefinition,
} from "@castkit/sdk/contracts"
import { Hono } from "hono"
import { afterEach, expect, test, vi } from "vitest"
import {
  createPlatform,
  type Platform,
} from "./platform.ts"
import { attachPlatformRoutes } from "./platformRoutes.ts"
import { hashPin } from "./platformStore.ts"

const runtimes = new Set<Platform>()
afterEach(() => {
  runtimes.forEach((runtime) => {
    runtime.dispose()
  })
  runtimes.clear()
  vi.restoreAllMocks()
})
const createFixture = async () => {
  const publisher = {
    isEnabled: true,
    publish: vi.fn(async () => undefined),
    subscribe: vi.fn(async () => undefined),
    close: async () => undefined,
  }
  const platform = await createPlatform({ publisher })
  runtimes.add(platform)
  const channels: ChannelDefinition[] = [
    {
      id: "printers",
      name: "Printers",
      sourceId: "mqtt",
      type: "printers.v1",
      settings: {
        commandTopic: "test/printers/command",
        actions: ["stop"],
      },
    },
    {
      id: "images",
      name: "Images",
      sourceId: "mqtt",
      type: "images.v1",
      settings: {},
    },
  ]
  const view: ViewDefinition = {
    id: "private",
    name: "Private display",
    layout: "split",
    access: "pin",
    theme: "dark",
    isControlEnabled: true,
    panels: [
      {
        id: "printer",
        specId: "printer-status",
        bindings: { data: "printers" },
        settings: {},
      },
      {
        id: "photo",
        specId: "photo-frame",
        bindings: { data: "images" },
        settings: {},
      },
    ],
  }
  platform.store.update((previous) => ({
    ...previous,
    sources: [
      {
        id: "mqtt",
        name: "MQTT",
        adapter: "mqtt",
        settings: {},
        isEnabled: true,
      },
    ],
    channels,
    views: [
      view,
      { ...view, id: "other", name: "Other display" },
    ],
    screens: [
      {
        id: "screen",
        name: "Screen",
        access: "pin",
        defaultViewId: "private",
        viewIds: ["private", "other"],
      },
    ],
    deviceScreens: { panel: "screen" },
    pinHashes: {
      "view:private": hashPin("1357"),
      "view:other": hashPin("2468"),
      "screen:screen": hashPin("1234"),
    },
  }))
  await platform.refresh()
  platform.hub.publish({
    channelId: "printers",
    data: {
      printers: [
        {
          id: "printer-one",
          name: "Printer",
          jobName: "Example",
          percent: 50,
          state: "printing",
        },
      ],
    },
  })
  platform.hub.publish({
    channelId: "images",
    data: {
      images: [
        {
          id: "asset",
          url: "/api/platform/channels/images/media/asset",
        },
      ],
    },
  })
  const app = new Hono()
  attachPlatformRoutes({ app, platform })
  const request = ({
    path,
    method = "GET",
    data,
    cookie,
  }: {
    path: string
    method?: string
    data?: unknown
    cookie?: string
  }) =>
    app.request(path, {
      method,
      headers: {
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    })
  const unlock = async (
    kind: "view" | "screen",
    id: string,
    pin: string,
  ) => {
    const response = await request({
      path: "/api/access/unlock",
      method: "POST",
      data: { kind, id, pin },
    })
    expect(response.status).toBe(200)
    return (
      response.headers.get("set-cookie")?.split(";")[0] ??
      ""
    )
  }
  return { platform, publisher, request, unlock }
}

test("private view grants cover only their snapshot, media, and controls", async () => {
  const fixture = await createFixture()
  const media = vi
    .spyOn(fixture.platform.runtime, "getMedia")
    .mockResolvedValue(
      new Response("image", {
        headers: { "content-type": "image/png" },
      }),
    )
  expect(
    (
      await fixture.request({
        path: "/api/display/view/private",
      })
    ).status,
  ).toBe(401)
  expect(
    (
      await fixture.request({
        path: "/api/display/view/private/media/images/asset",
      })
    ).status,
  ).toBe(401)
  expect(media).not.toHaveBeenCalled()
  const cookie = await fixture.unlock(
    "view",
    "private",
    "1357",
  )
  const snapshot = await (
    await fixture.request({
      path: "/api/display/view/private",
      cookie,
    })
  ).json()
  expect(snapshot.channels.images.data.images[0].url).toBe(
    "/api/display/view/private/media/images/asset",
  )
  expect(
    (
      await fixture.request({
        path: "/api/display/view/private/media/images/asset",
        cookie,
      })
    ).status,
  ).toBe(200)
  expect(
    (
      await fixture.request({
        path: "/api/display/view/other",
        cookie,
      })
    ).status,
  ).toBe(401)
  expect(
    (
      await fixture.request({
        path: "/api/display/view/private/media/unassigned/asset",
        cookie,
      })
    ).status,
  ).toBe(403)
  expect(
    (
      await fixture.request({
        path: "/api/platform/channels/images/media/asset",
        cookie,
      })
    ).status,
  ).toBe(401)
})

test("expiring a grant closes data, media, and actions together", async () => {
  const fixture = await createFixture()
  const cookie = await fixture.unlock(
    "view",
    "private",
    "1357",
  )
  fixture.platform.store.update((previous) => ({
    ...previous,
    sessions: previous.sessions.map((session) => ({
      ...session,
      grants: session.grants.map((grant) => ({
        ...grant,
        expiresAt: Date.now() - 1,
      })),
    })),
  }))
  expect(
    (
      await fixture.request({
        path: "/api/display/view/private",
        cookie,
      })
    ).status,
  ).toBe(401)
  expect(
    (
      await fixture.request({
        path: "/api/display/view/private/media/images/asset",
        cookie,
      })
    ).status,
  ).toBe(401)
  expect(
    (
      await fixture.request({
        path: "/api/display/view/private/actions",
        method: "POST",
        cookie,
        data: {
          panelId: "printer",
          action: "stop",
          payload: { printerId: "printer-one" },
        },
      })
    ).status,
  ).toBe(401)
})

test("a stale physical target requests a page reload after its assignment changes", async () => {
  const fixture = await createFixture()
  const cookie = await fixture.unlock(
    "screen",
    "screen",
    "1234",
  )
  expect(
    (
      await fixture.request({
        path: "/api/display/screen/screen?device=panel",
        cookie,
      })
    ).status,
  ).toBe(200)
  fixture.platform.store.update((previous) => ({
    ...previous,
    deviceScreens: {},
  }))
  const changed = await fixture.request({
    path: "/api/display/screen/screen?device=panel",
    cookie,
  })
  expect(changed.status).toBe(409)
  expect(await changed.json()).toMatchObject({
    error: "device-assignment-changed",
  })
})

test("printer controls reject missing targets, other printers, and stale data before MQTT", async () => {
  const fixture = await createFixture()
  const cookie = await fixture.unlock(
    "view",
    "private",
    "1357",
  )
  fixture.publisher.publish.mockClear()
  const action = (payload: Record<string, unknown>) =>
    fixture.request({
      path: "/api/display/view/private/actions",
      method: "POST",
      cookie,
      data: { panelId: "printer", action: "stop", payload },
    })
  expect((await action({})).status).toBe(400)
  expect(
    (await action({ printerId: "other-printer" })).status,
  ).toBe(400)
  expect(fixture.publisher.publish).not.toHaveBeenCalled()
  fixture.platform.hub.setStatus({
    channelId: "printers",
    status: "error",
    error: "Disconnected",
  })
  expect(
    (await action({ printerId: "printer-one" })).status,
  ).toBe(409)
  expect(fixture.publisher.publish).not.toHaveBeenCalled()
})

test("a screen grant can navigate its allowlist without unlocking standalone private URLs", async () => {
  const fixture = await createFixture()
  const path = "/api/display/screen/screen/select"
  expect(
    (
      await fixture.request({
        path,
        method: "POST",
        data: { viewId: "other" },
      })
    ).status,
  ).toBe(401)
  const cookie = await fixture.unlock(
    "screen",
    "screen",
    "1234",
  )
  const selected = await fixture.request({
    path,
    method: "POST",
    cookie,
    data: { viewId: "other" },
  })
  expect(selected.status).toBe(200)
  expect(await selected.json()).toMatchObject({
    view: { id: "other" },
    availableViews: [{ id: "private" }, { id: "other" }],
  })
  expect(
    (
      await fixture.request({
        path,
        method: "POST",
        cookie,
        data: { viewId: "outside" },
      })
    ).status,
  ).toBe(403)
  expect(
    (
      await fixture.request({
        path: "/api/display/view/other",
        cookie,
      })
    ).status,
  ).toBe(401)
  expect(
    (
      await fixture.request({
        path: "/api/manage/platform",
        cookie,
      })
    ).status,
  ).toBe(401)
})
