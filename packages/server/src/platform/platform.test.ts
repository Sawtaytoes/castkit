import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Hono } from "hono"
import {
  afterEach,
  describe,
  expect,
  test,
  vi,
} from "vitest"
import {
  createPlatform,
  type Platform,
} from "./platform.ts"
import { attachPlatformRoutes } from "./platformRoutes.ts"
import { createPlatformStore } from "./platformStore.ts"

const runtimes = new Set<Platform>()
const directories = new Set<string>()
afterEach(() => {
  runtimes.forEach((runtime) => {
    runtime.dispose()
  })
  runtimes.clear()
  directories.forEach((directory) => {
    rmSync(directory, { recursive: true, force: true })
  })
  directories.clear()
})
const createFixture = async () => {
  const directory = mkdtempSync(
    join(tmpdir(), "castkit-platform-"),
  )
  directories.add(directory)
  const file = join(directory, "platform.json")
  const publisher = {
    isEnabled: false,
    publish: vi.fn(async () => {}),
    subscribe: vi.fn(async () => {}),
    close: async () => {},
  }
  const platform = await createPlatform({ file, publisher })
  runtimes.add(platform)
  const app = new Hono()
  attachPlatformRoutes({ app, platform })
  const request = (
    path: string,
    method = "GET",
    data?: unknown,
    cookie?: string,
  ) =>
    app.request(path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    })
  const setup = await request("/api/access/setup", "POST", {
    setupToken: platform.store.get().setupToken,
    pin: "123456",
  })
  const cookie =
    setup.headers.get("set-cookie")?.split(";")[0] ?? ""
  const save = (collection: string, data: unknown) =>
    request(
      `/api/manage/platform/${collection}`,
      "POST",
      data,
      cookie,
    )
  await save("sources", {
    id: "events",
    name: "Events",
    adapter: "mqtt",
    settings: {},
    isEnabled: true,
  })
  await save("channels", {
    id: "printers/workbench",
    name: "Printers",
    sourceId: "events",
    type: "printers.v1",
    settings: {},
  })
  const view = {
    id: "workbench",
    name: "Workbench",
    layout: "single",
    theme: "dark",
    access: "public",
    isControlEnabled: false,
    panels: [
      {
        id: "printers",
        specId: "printer-status",
        bindings: { data: "printers/workbench" },
        settings: {},
      },
    ],
  }
  await save("views", view)
  return {
    platform,
    publisher,
    app,
    request,
    save,
    cookie,
    file,
    view,
  }
}

describe("platform access and saved compositions", () => {
  test("keeps management private while public views need no API token", async () => {
    const fixture = await createFixture()
    expect(
      (await fixture.request("/api/manage/platform"))
        .status,
    ).toBe(401)
    expect(
      (await fixture.request("/api/display/view/workbench"))
        .status,
    ).toBe(200)
    const state = await (
      await fixture.request(
        "/api/manage/platform",
        "GET",
        undefined,
        fixture.cookie,
      )
    ).json()
    expect(state).not.toHaveProperty("setupToken")
    expect(state).not.toHaveProperty("sessions")
    expect(state).not.toHaveProperty("pinHashes")
  })
  test("one management sign-in enables public printer controls across views and sign-out revokes them", async () => {
    const fixture = await createFixture()
    await fixture.request(
      "/api/manage/platform/views/workbench",
      "PUT",
      { ...fixture.view, isControlEnabled: true },
      fixture.cookie,
    )
    await fixture.save("views", {
      ...fixture.view,
      id: "camera",
      isControlEnabled: true,
    })
    fixture.platform.hub.publish({
      channelId: "printers/workbench",
      data: {
        printers: [
          {
            id: "printer-a",
            name: "Printer",
            jobName: "Bracket",
            percent: 20,
            state: "printing",
          },
        ],
      },
    })
    const execute = vi
      .spyOn(fixture.platform.runtime, "executeAction")
      .mockResolvedValue({ ok: true })
    const action = {
      panelId: "printers",
      action: "pause",
      payload: { printerId: "printer-a" },
    }
    const publicSnapshot = await (
      await fixture.request("/api/display/view/workbench")
    ).json()
    expect(publicSnapshot.isAuthenticated).toBe(false)
    expect(publicSnapshot.canControl).toBe(false)
    expect(
      (
        await fixture.request(
          "/api/display/view/workbench/actions",
          "POST",
          action,
        )
      ).status,
    ).toBe(403)
    expect(execute).not.toHaveBeenCalled()
    const login = await fixture.request(
      "/api/access/login",
      "POST",
      { pin: "123456" },
    )
    const cookie = login.headers
      .get("set-cookie")
      ?.split(";")[0]
    await Promise.all(
      ["workbench", "camera"].map(async (id) => {
        const snapshot = await (
          await fixture.request(
            `/api/display/view/${id}`,
            "GET",
            undefined,
            cookie,
          )
        ).json()
        expect(snapshot.isAuthenticated).toBe(true)
        expect(snapshot.canControl).toBe(true)
        expect(
          (
            await fixture.request(
              `/api/display/view/${id}/actions`,
              "POST",
              action,
              cookie,
            )
          ).status,
        ).toBe(200)
      }),
    )
    expect(execute).toHaveBeenCalledTimes(2)
    await fixture.request(
      "/api/access/logout",
      "POST",
      {},
      cookie,
    )
    expect(
      (
        await fixture.request(
          "/api/display/view/camera/actions",
          "POST",
          action,
          cookie,
        )
      ).status,
    ).toBe(403)
    expect(
      (
        await fixture.request(
          "/api/display/view/camera",
          "GET",
          undefined,
          cookie,
        )
      ).status,
    ).toBe(200)
    expect(execute).toHaveBeenCalledTimes(2)
  })
  test("view-specific PINs and expired management sessions cannot operate printers", async () => {
    const fixture = await createFixture()
    await fixture.request(
      "/api/manage/platform/views/workbench",
      "PUT",
      {
        ...fixture.view,
        access: "pin",
        pin: "4477",
        isControlEnabled: true,
      },
      fixture.cookie,
    )
    const unlock = await fixture.request(
      "/api/access/unlock",
      "POST",
      { kind: "view", id: "workbench", pin: "4477" },
    )
    const viewerCookie = unlock.headers
      .get("set-cookie")
      ?.split(";")[0]
    const viewer = await (
      await fixture.request(
        "/api/display/view/workbench",
        "GET",
        undefined,
        viewerCookie,
      )
    ).json()
    expect(viewer.isAuthenticated).toBe(false)
    expect(viewer.canControl).toBe(false)
    const management = await fixture.request(
      "/api/access/unlock",
      "POST",
      { kind: "view", id: "workbench", pin: "123456" },
    )
    const managementCookie = management.headers
      .get("set-cookie")
      ?.split(";")[0]
    expect(
      (
        await (
          await fixture.request(
            "/api/access/session",
            "GET",
            undefined,
            managementCookie,
          )
        ).json()
      ).isAuthenticated,
    ).toBe(true)
    await fixture.request(
      "/api/manage/platform/views/workbench",
      "PUT",
      { ...fixture.view, isControlEnabled: true },
      fixture.cookie,
    )
    fixture.platform.store.update((previous) => ({
      ...previous,
      sessions: previous.sessions.map((session) =>
        session.isAdmin
          ? { ...session, expiresAt: Date.now() - 1 }
          : session,
      ),
    }))
    const expired = await (
      await fixture.request(
        "/api/display/view/workbench",
        "GET",
        undefined,
        managementCookie,
      )
    ).json()
    expect(expired.canControl).toBe(false)
    expect(expired.isAuthenticated).toBe(false)
    expect(
      (
        await fixture.request(
          "/api/display/view/workbench/actions",
          "POST",
          { panelId: "printers", action: "stop" },
          managementCookie,
        )
      ).status,
    ).toBe(403)
  })
  test("requires the one-time setup token and rejects a second setup", async () => {
    const fixture = await createFixture()
    expect(
      (
        await fixture.request("/api/access/setup", "POST", {
          setupToken: "incorrect",
          pin: "1234",
        })
      ).status,
    ).toBe(403)
    expect(
      (
        await fixture.request("/api/access/login", "POST", {
          pin: "wrong",
        })
      ).status,
    ).toBe(401)
    expect(
      (
        await fixture.request("/api/access/login", "POST", {
          pin: "123456",
        })
      ).status,
    ).toBe(200)
    expect(
      readFileSync(fixture.file, "utf8"),
    ).not.toContain('"123456"')
  })
  test("a screen's snapshot answers activity per view and per panel", async () => {
    const fixture = await createFixture()
    await fixture.save("channels", {
      id: "rip-deck/live",
      name: "Rip deck",
      sourceId: "events",
      type: "rip-deck.v1",
      settings: {},
    })
    await fixture.save("views", {
      ...fixture.view,
      id: "now",
      name: "Now",
      layout: "split",
      isActiveOnly: true,
      panels: [
        ...fixture.view.panels,
        {
          id: "rips",
          specId: "rip-deck",
          bindings: { data: "rip-deck/live" },
          settings: {},
        },
      ],
    })
    expect(
      (
        await fixture.save("screens", {
          id: "working",
          name: "Working",
          defaultViewId: "now",
          viewIds: ["now", "workbench"],
          access: "public",
        })
      ).status,
    ).toBe(201)
    fixture.platform.hub.publish({
      channelId: "printers/workbench",
      data: { printers: [] },
    })
    fixture.platform.hub.publish({
      channelId: "rip-deck/live",
      data: {
        bays: [],
        alerts: [],
        isPresent: true,
        activeCount: 1,
        loadedDiscCount: 1,
      },
    })
    const idle = await (
      await fixture.request("/api/display/screen/working")
    ).json()
    expect(idle.view.isActiveOnly).toBe(true)
    expect(idle.panelActivity).toEqual({
      printers: false,
      rips: true,
    })
    expect(idle.availableViews).toEqual([
      { id: "now", name: "Now", isActive: true },
      {
        id: "workbench",
        name: "Workbench",
        isActive: false,
      },
    ])
    fixture.platform.hub.publish({
      channelId: "printers/workbench",
      data: {
        printers: [
          {
            id: "one",
            name: "Printer One",
            jobName: "Desk stand",
            percent: 40,
            state: "printing",
          },
        ],
      },
    })
    const printing = await (
      await fixture.request("/api/display/screen/working")
    ).json()
    expect(printing.panelActivity).toEqual({
      printers: true,
      rips: true,
    })
    expect(printing.availableViews[1].isActive).toBe(true)
  })
  test("a paused track keeps its panel in an active-only view for ten minutes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    try {
      const fixture = await createFixture()
      await fixture.save("channels", {
        id: "music/now-playing",
        name: "Music",
        sourceId: "events",
        type: "now-playing.v1",
        settings: {},
      })
      await fixture.save("views", {
        ...fixture.view,
        id: "now",
        name: "Now",
        layout: "split",
        isActiveOnly: true,
        panels: [
          ...fixture.view.panels,
          {
            id: "music",
            specId: "now-playing",
            bindings: { data: "music/now-playing" },
            settings: {},
          },
        ],
      })
      fixture.platform.hub.publish({
        channelId: "printers/workbench",
        data: { printers: [] },
      })
      const track = {
        title: "Track One",
        artist: "Artist One",
      }
      const musicActivity = async () =>
        (
          await (
            await fixture.request("/api/display/view/now")
          ).json()
        ).panelActivity.music
      fixture.platform.hub.publish({
        channelId: "music/now-playing",
        data: { ...track, isPlaying: true },
      })
      expect(await musicActivity()).toBe(true)
      vi.advanceTimersByTime(5 * 60 * 1000)
      // Music Assistant turns a sync-group pause into a stop: the payload
      // only says the track is not playing.
      fixture.platform.hub.publish({
        channelId: "music/now-playing",
        data: { ...track, isPlaying: false },
      })
      expect(await musicActivity()).toBe(true)
      vi.advanceTimersByTime(9 * 60 * 1000)
      expect(await musicActivity()).toBe(true)
      vi.advanceTimersByTime(60 * 1000)
      expect(await musicActivity()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
  test("persists definitions and a kiosk grant without storing the PIN", async () => {
    const fixture = await createFixture()
    expect(
      (
        await fixture.save("views", {
          ...fixture.view,
          id: "private",
          access: "pin",
          pin: "9832",
        })
      ).status,
    ).toBe(201)
    expect(
      (await fixture.request("/api/display/view/private"))
        .status,
    ).toBe(401)
    const unlocked = await fixture.request(
      "/api/access/unlock",
      "POST",
      { kind: "view", id: "private", pin: "9832" },
    )
    const cookie = unlocked.headers
      .get("set-cookie")
      ?.split(";")[0]
    expect(
      (
        await fixture.request(
          "/api/display/view/private",
          "GET",
          undefined,
          cookie,
        )
      ).status,
    ).toBe(200)
    const restored = createPlatformStore({
      file: fixture.file,
    })
    expect(restored.get().views).toHaveLength(2)
    expect(restored.get().sessions.length).toBe(2)
    expect(
      readFileSync(fixture.file, "utf8"),
    ).not.toContain('"9832"')
    await fixture.request(
      "/api/access/lock",
      "POST",
      { kind: "view", id: "private" },
      cookie,
    )
    expect(
      (
        await fixture.request(
          "/api/display/view/private",
          "GET",
          undefined,
          cookie,
        )
      ).status,
    ).toBe(401)
  })
  test("the management PIN unlocks a private display, including one with no PIN of its own", async () => {
    const fixture = await createFixture()
    expect(
      (
        await fixture.save("views", {
          ...fixture.view,
          id: "keyed",
          access: "pin",
          pin: "4477",
        })
      ).status,
    ).toBe(201)
    const wrong = await fixture.request(
      "/api/access/unlock",
      "POST",
      { kind: "view", id: "keyed", pin: "0000" },
    )
    expect(wrong.status).toBe(401)
    const byMaster = await fixture.request(
      "/api/access/unlock",
      "POST",
      { kind: "view", id: "keyed", pin: "123456" },
    )
    expect(byMaster.status).toBe(200)
    fixture.platform.store.update((previous) => ({
      ...previous,
      views: [
        ...previous.views,
        ...previous.views
          .filter((view) => view.id === "keyed")
          .map((view) => ({ ...view, id: "orphan" })),
      ],
    }))
    const orphan = await fixture.request(
      "/api/access/unlock",
      "POST",
      { kind: "view", id: "orphan", pin: "123456" },
    )
    expect(orphan.status).toBe(200)
  })

  test("rejects incompatible bindings and changes which would break an existing view", async () => {
    const fixture = await createFixture()
    const invalid = {
      ...fixture.view,
      id: "invalid",
      panels: [
        { ...fixture.view.panels[0], specId: "weather" },
      ],
    }
    expect(
      (await fixture.save("views", invalid)).status,
    ).toBe(400)
    expect(
      (
        await fixture.request(
          "/api/manage/platform/channels/printers%2Fworkbench",
          "PUT",
          {
            id: "printers/workbench",
            name: "Changed",
            sourceId: "events",
            type: "weather.v1",
            settings: {},
          },
          fixture.cookie,
        )
      ).status,
    ).toBe(400)
    expect(
      (
        await fixture.request(
          "/api/manage/platform/channels/printers%2Fworkbench",
          "DELETE",
          undefined,
          fixture.cookie,
        )
      ).status,
    ).toBe(409)
  })
  test("does not expose a private view through a public screen", async () => {
    const fixture = await createFixture()
    await fixture.save("views", {
      ...fixture.view,
      id: "private",
      access: "pin",
      pin: "9832",
    })
    expect(
      (
        await fixture.save("screens", {
          id: "office",
          name: "Office",
          defaultViewId: "private",
          viewIds: ["private"],
          access: "public",
        })
      ).status,
    ).toBe(400)
    expect(
      (
        await fixture.save("screens", {
          id: "office",
          name: "Office",
          defaultViewId: "private",
          viewIds: ["private"],
          access: "pin",
          pin: "4567",
        })
      ).status,
    ).toBe(201)
    const unlocked = await fixture.request(
      "/api/access/unlock",
      "POST",
      { kind: "screen", id: "office", pin: "4567" },
    )
    const cookie = unlocked.headers
      .get("set-cookie")
      ?.split(";")[0]
    expect(
      (
        await fixture.request(
          "/api/display/screen/office",
          "GET",
          undefined,
          cookie,
        )
      ).status,
    ).toBe(200)
    expect(
      (
        await fixture.request(
          "/api/display/view/private",
          "GET",
          undefined,
          cookie,
        )
      ).status,
    ).toBe(401)
  })
  test("scopes controls and media to the current authorized composition", async () => {
    const fixture = await createFixture()
    expect(
      (
        await fixture.request(
          "/api/display/view/workbench/actions",
          "POST",
          { panelId: "printers", action: "stop" },
        )
      ).status,
    ).toBe(403)
    expect(
      (
        await fixture.request(
          "/api/display/view/workbench/media/other/asset",
        )
      ).status,
    ).toBe(403)
    const media = vi
      .spyOn(fixture.platform.runtime, "getMedia")
      .mockResolvedValue(
        new Response("<script>bad</script>", {
          headers: { "content-type": "text/html" },
        }),
      )
    expect(
      (
        await fixture.request(
          "/api/display/view/workbench/media/printers%2Fworkbench/asset",
        )
      ).status,
    ).toBe(415)
    expect(media).toHaveBeenCalledOnce()
  })
  test("keeps source secrets out of management and viewer responses", async () => {
    const fixture = await createFixture()
    await fixture.save("sources", {
      id: "photos",
      name: "Photos",
      adapter: "immich",
      settings: { url: "https://photos.example.test" },
      secrets: { apiKey: "private-key" },
      isEnabled: false,
    })
    const response = await fixture.request(
      "/api/manage/platform",
      "GET",
      undefined,
      fixture.cookie,
    )
    expect(await response.text()).not.toContain(
      "private-key",
    )
    expect(
      fixture.platform.store.get().secrets.photos?.apiKey,
    ).toBe("private-key")
  })
  test("rejects cross-origin mutations and rate limits PIN attempts", async () => {
    const fixture = await createFixture()
    const response = await fixture.app.request(
      "/api/access/logout",
      {
        method: "POST",
        headers: {
          Origin: "https://attacker.invalid",
          Cookie: fixture.cookie,
        },
      },
    )
    expect(response.status).toBe(403)
    await Promise.all(
      Array.from({ length: 5 }, () =>
        fixture.request("/api/access/login", "POST", {
          pin: "wrong",
        }),
      ),
    )
    expect(
      (
        await fixture.request("/api/access/login", "POST", {
          pin: "wrong",
        })
      ).status,
    ).toBe(429)
  })
  test("disabled component plugins hide dependent presets and cannot be used", async () => {
    const fixture = await createFixture()
    const response = await fixture.request(
      "/api/manage/platform/plugins/castkit.views.photos",
      "PUT",
      { isEnabled: false },
      fixture.cookie,
    )
    expect(response.status).toBe(200)
    const catalog = await (
      await fixture.request(
        "/api/manage/platform",
        "GET",
        undefined,
        fixture.cookie,
      )
    ).json()
    expect(
      catalog.presets.some(
        (preset: { id: string }) =>
          preset.id === "agenda-photos",
      ),
    ).toBe(false)
    expect(
      catalog.viewSpecs.some(
        (spec: { id: string }) => spec.id === "photo-frame",
      ),
    ).toBe(false)
    const inUse = await fixture.request(
      "/api/manage/platform/plugins/castkit.views.printers",
      "PUT",
      { isEnabled: false },
      fixture.cookie,
    )
    expect(inUse.status).toBe(409)
  })
  test("editing a screen preserves its persistent selection", async () => {
    const fixture = await createFixture()
    await fixture.save("views", {
      ...fixture.view,
      id: "second",
    })
    const screen = {
      id: "desktop",
      name: "Desktop",
      defaultViewId: "workbench",
      viewIds: ["workbench", "second"],
      access: "public",
    }
    await fixture.save("screens", screen)
    fixture.platform.screens.select({
      screenId: "desktop",
      viewId: "second",
    })
    const response = await fixture.request(
      "/api/manage/platform/screens/desktop",
      "PUT",
      { ...screen, name: "Updated" },
      fixture.cookie,
    )
    expect(response.status).toBe(200)
    expect(
      fixture.platform.getTarget({
        kind: "screen",
        id: "desktop",
      })?.view.id,
    ).toBe("second")
  })
  test("restores the base view after a temporary high-priority selection expires", async () => {
    const fixture = await createFixture()
    await fixture.save("views", {
      ...fixture.view,
      id: "alert",
    })
    await fixture.save("screens", {
      id: "desktop",
      name: "Desktop",
      defaultViewId: "workbench",
      viewIds: ["workbench", "alert"],
      access: "public",
    })
    fixture.platform.screens.select({
      screenId: "desktop",
      viewId: "alert",
      durationSeconds: 0.05,
      priority: 100,
    })
    expect(
      fixture.platform.getTarget({
        kind: "screen",
        id: "desktop",
      })?.view.id,
    ).toBe("alert")
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(
      fixture.platform.getTarget({
        kind: "screen",
        id: "desktop",
      })?.view.id,
    ).toBe("workbench")
  })
})

test("tags survive management saves and a store reload for every collection", async () => {
  const fixture = await createFixture()
  const definitions = {
    sources: {
      id: "tagged-source",
      name: "Tagged source",
      adapter: "mqtt",
      settings: {},
      isEnabled: true,
      tags: ["Controls", "Shared"],
    },
    channels: {
      id: "tagged-channel",
      name: "Tagged channel",
      sourceId: "tagged-source",
      type: "entities.v1",
      settings: {},
      tags: ["Controls"],
    },
    views: {
      ...fixture.view,
      id: "tagged-view",
      tags: ["Information"],
    },
    screens: {
      id: "tagged-screen",
      name: "Tagged screen",
      defaultViewId: "tagged-view",
      viewIds: ["tagged-view"],
      access: "public",
      tags: ["Browser"],
    },
  }
  for (const [collection, definition] of Object.entries(
    definitions,
  )) {
    expect(
      (await fixture.save(collection, definition)).status,
    ).toBe(201)
  }
  const reloaded = createPlatformStore({
    file: fixture.file,
  }).get()
  for (const [collection, definition] of Object.entries(
    definitions,
  )) {
    expect(
      reloaded[collection as keyof typeof definitions].find(
        (item) => item.id === definition.id,
      )?.tags,
    ).toEqual(definition.tags)
  }
  expect(
    (
      await fixture.save("views", {
        ...fixture.view,
        id: "invalid-tags",
        tags: [""],
      })
    ).status,
  ).toBe(400)
})
