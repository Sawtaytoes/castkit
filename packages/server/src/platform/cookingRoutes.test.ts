import { MONOCHROME_PALETTE } from "@castkit/core/panels/palette"
import type { CommandHandler } from "@castkit/shared/mqtt/publisher"
import { Hono } from "hono"
import { afterEach, expect, test, vi } from "vitest"
import {
  createPlatform,
  type Platform,
} from "./platform.ts"
import { attachPlatformRoutes } from "./platformRoutes.ts"

const platforms: Platform[] = []
afterEach(() => {
  for (const platform of platforms) platform.dispose()
  vi.unstubAllGlobals()
})
const setup = async () => {
  const handlers: CommandHandler[] = []
  const publisher = {
    isEnabled: true,
    publish: vi.fn(async () => {}),
    subscribe: vi.fn(
      async ({ handler }: { handler: CommandHandler }) => {
        handlers.push(handler)
      },
    ),
    close: async () => {},
  }
  const platform = await createPlatform({
    apiToken: "test-admin-token",
    publisher,
    devices: [
      {
        id: "panel",
        label: "Recipe panel",
        mac: "02:00:00:00:00:01",
        width: 800,
        height: 480,
        colorMode: "monochrome",
        palette: MONOCHROME_PALETTE,
        rotation: 0,
        ditherProfile: {
          algorithm: "off",
          supersampleFactor: 1,
        },
        repaint: "super-slow",
        power: "wired",
      },
    ],
  })
  platforms.push(platform)
  platform.store.update((previous) => ({
    ...previous,
    sources: [
      {
        id: "recipes",
        name: "Recipes",
        adapter: "mealie",
        settings: { url: "https://recipes.example" },
        isEnabled: true,
      },
    ],
    secrets: {
      recipes: { apiToken: "private-upstream-token" },
    },
  }))
  const app = new Hono()
  attachPlatformRoutes({ app, platform })
  const request = (
    path: string,
    data?: unknown,
    headers: Record<string, string> = {},
  ) =>
    app.request(path, {
      method: data ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    })
  const fetchMock = vi.fn(async () =>
    Response.json({
      name: "Skillet",
      slug: "skillet",
      recipeIngredient: [{ display: "2 cans chickpeas" }],
      // Long enough to page, so Next has somewhere to go.
      recipeInstructions: [
        { text: "Warm and serve. ".repeat(250) },
      ],
    }),
  )
  vi.stubGlobal("fetch", fetchMock)
  return {
    platform,
    app,
    request,
    fetchMock,
    handlers,
    publisher,
  }
}
test("authenticated start creates a private target; scoped keys cannot configure sources", async () => {
  const { request, platform, fetchMock } = await setup()
  const input = {
    sourceId: "recipes",
    deviceId: "panel",
    link: "skillet",
  }
  expect(
    (await request("/api/manage/cooking", input)).status,
  ).toBe(401)
  const response = await request(
    "/api/manage/cooking",
    input,
    { Authorization: "Bearer test-admin-token" },
  )
  expect(response.status).toBe(200)
  const session = await response.json()
  expect(JSON.stringify(session)).not.toContain(
    "private-upstream-token",
  )
  const key = session.controlPath.split("#")[1]
  expect(
    (
      await request(
        `/api/cooking/${session.id}/state`,
        undefined,
        { "x-castkit-cooking-key": key },
      )
    ).status,
  ).toBe(200)
  expect(
    (
      await request("/api/manage/platform", undefined, {
        "x-castkit-cooking-key": key,
      })
    ).status,
  ).toBe(401)
  expect(
    (await request(`/api/display/view/${session.targetId}`))
      .status,
  ).toBe(401)
  expect(platform.getDeviceTarget("panel")?.id).toBe(
    session.targetId,
  )
  const called = fetchMock.mock.calls[0] as unknown as [
    string,
    RequestInit,
  ]
  expect(called[0]).toBe(
    "https://recipes.example/api/recipes/skillet",
  )
  expect(called[1].redirect).toBe("error")
  const next = await request(
    `/api/cooking/${session.id}/command`,
    { action: "next", revision: 0 },
    { "x-castkit-cooking-key": key },
  )
  expect(next.status).toBe(200)
  expect(platform.getDeviceTarget("panel")?.id).not.toBe(
    session.targetId,
  )
  expect(
    (
      await request(
        `/api/cooking/${session.id}/command`,
        { action: "next", revision: 0 },
        { "x-castkit-cooking-key": key },
      )
    ).status,
  ).toBe(409)
  expect(
    (
      await request(
        `/api/cooking/${session.id}/command`,
        { action: "done", revision: 1 },
        {
          "x-castkit-cooking-key": key,
          Origin: "https://foreign.example",
        },
      )
    ).status,
  ).toBe(403)
})
test("normal data changes do not displace a recipe and an interruption returns to its exact page", async () => {
  const { platform } = await setup()
  const session = platform.cooking.start({
    sourceId: "recipes",
    deviceId: "panel",
    width: 800,
    height: 480,
    recipe: {
      name: "Skillet",
      slug: "skillet",
      url: "https://recipes.example/g/home/r/skillet",
      ingredients: ["1 lemon"],
      instructions: ["Serve."],
      notes: [],
    },
  })
  const next = platform.cooking.command(session.id, "next")!
  platform.store.update((previous) => ({
    ...previous,
    views: [
      {
        id: "alert",
        name: "Alert",
        layout: "single",
        panels: [],
        theme: "light",
        access: "public",
        isControlEnabled: false,
      },
    ],
  }))
  platform.deviceOverrides.show({
    deviceId: "panel",
    viewId: "alert",
    priority: 100,
    durationSeconds: 60,
  })
  expect(platform.getDeviceTarget("panel")?.id).toBe(
    "alert",
  )
  platform.deviceOverrides.clear({
    deviceId: "panel",
    viewId: "alert",
  })
  expect(platform.getDeviceTarget("panel")?.id).toBe(
    platform.cooking.targetId(next),
  )
  platform.cooking.command(session.id, "done")
  expect(platform.getDeviceTarget("panel")).toBeUndefined()
})
test("MQTT controls require a current session revision and an unexpired command", async () => {
  const { handlers, platform, publisher } = await setup()
  const session = platform.cooking.start({
    sourceId: "recipes",
    deviceId: "panel",
    width: 800,
    height: 480,
    recipe: {
      name: "Skillet",
      slug: "skillet",
      url: "https://recipes.example/g/home/r/skillet",
      ingredients: ["1 lemon"],
      instructions: ["Serve. ".repeat(500)],
      notes: [],
    },
  })
  const message = {
    topic: "castkit/cooking/cmd",
    payload: JSON.stringify({
      requestId: "one",
      issuedAt: Date.now(),
      sessionId: session.id,
      revision: 0,
      action: "next",
    }),
  }
  for (const handler of handlers) await handler(message)
  expect(platform.cooking.get(session.id)?.revision).toBe(1)
  for (const handler of handlers) await handler(message)
  expect(platform.cooking.get(session.id)?.revision).toBe(1)
  const expired = {
    ...message,
    payload: JSON.stringify({
      requestId: "old",
      issuedAt: Date.now() - 120000,
      sessionId: session.id,
      revision: 1,
      action: "done",
    }),
  }
  for (const handler of handlers) await handler(expired)
  expect(platform.cooking.get(session.id)).toBeDefined()
  expect(publisher.publish).toHaveBeenCalledWith(
    expect.objectContaining({
      topic: "castkit/cooking/resp/old",
      isRetained: false,
    }),
  )
})

test("browser kiosk targets are refused before fetching or importing a recipe", async () => {
  const { platform, request, fetchMock } = await setup()
  const device = platform.getDeviceProperties("panel")!
  vi.spyOn(platform, "getDeviceProperties").mockReturnValue(
    { ...device, delivery: "browser" },
  )
  const response = await request(
    "/api/manage/cooking",
    {
      sourceId: "recipes",
      deviceId: "panel",
      link: "skillet",
    },
    { Authorization: "Bearer test-admin-token" },
  )
  expect(response.status).toBe(400)
  expect(fetchMock).not.toHaveBeenCalled()
  expect(platform.cooking.list()).toEqual([])
})
