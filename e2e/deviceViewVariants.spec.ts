import { mkdirSync } from "node:fs"
import { expect, test } from "@playwright/test"
import type { Device } from "../packages/admin/src/device.ts"
import type { Platform } from "../packages/admin/src/platformApi.ts"

test("devices customize one shared points view without sharing room scans", async ({
  page,
}, testInfo) => {
  const request = page.request
  expect(
    (
      await request.post("/api/access/login", {
        data: { pin: "2468" },
      })
    ).ok(),
  ).toBe(true)
  const originalPlatform = (await (
    await request.get("/api/manage/platform")
  ).json()) as Platform
  const registry = (await (
    await request.get("/api/manage/devices")
  ).json()) as { devices: Device[] }
  const devices = registry.devices.filter(
    (device: { id: string }) =>
      ["e2e-square", "e2e-stream"].includes(device.id),
  )
  const first = await page.context().newPage()
  const second = await page.context().newPage()
  const viewId = "shared-points-variants"
  const view = {
    id: viewId,
    name: "Tally Marks Shared",
    layout: "single",
    theme: "dark",
    access: "public",
    isControlEnabled: false,
    panels: [
      {
        id: "board",
        specId: "kids-points",
        bindings: { data: "variants/shared" },
        settings: {
          isAllChildrenVisible: false,
          scanSeconds: 30,
        },
      },
    ],
  }
  const points = (total: number) => ({
    kids: [
      {
        id: "robin",
        name: "Robin",
        pointsToday: total,
        goal: 400,
        color: "#269b53",
      },
    ],
  })
  try {
    await ["shared", "one", "two"].reduce<Promise<void>>(
      async (previous, room) => {
        await previous
        expect(
          (
            await request.post(
              "/api/manage/platform/channels",
              {
                data: {
                  id: `variants/${room}`,
                  name: `Room ${room} points`,
                  sourceId: "events",
                  type: "kids-points.v1",
                  settings: {},
                },
              },
            )
          ).ok(),
        ).toBe(true)
        expect(
          (
            await request.post("/__test__/mqtt", {
              data: {
                topic: `castkit/channels/variants/${room}/set`,
                payload: points(
                  room === "shared"
                    ? 999
                    : room === "one"
                      ? 123
                      : 321,
                ),
              },
            })
          ).ok(),
        ).toBe(true)
      },
      Promise.resolve(),
    )
    expect(
      (
        await request.post("/api/manage/platform/views", {
          data: view,
        })
      ).ok(),
    ).toBe(true)
    expect(
      (
        await request.post("/api/manage/platform/screens", {
          data: {
            id: "variant-screen",
            name: "Variants",
            defaultViewId: viewId,
            viewIds: [viewId],
            access: "public",
          },
        })
      ).ok(),
    ).toBe(true)
    await devices.reduce<Promise<void>>(
      async (previous, device: { id: string }) => {
        await previous
        expect(
          (
            await request.put(
              `/api/manage/platform/device-screens/${device.id}`,
              { data: { screenId: "variant-screen" } },
            )
          ).ok(),
        ).toBe(true)
      },
      Promise.resolve(),
    )
    await first.goto("/d/e2e-square")
    await second.goto("/d/e2e-stream")
    await expect(
      first.locator(
        ".kids-points-total strong:not([aria-hidden=true])",
      ),
    ).toHaveText("999")
    await expect(
      second.locator(
        ".kids-points-total strong:not([aria-hidden=true])",
      ),
    ).toHaveText("999")
    expect(
      (
        await page.goto(
          "/manage/devices/variants?device=e2e-square",
        )
      )?.status(),
    ).toBe(200)
    await page
      .getByRole("button", { name: /^Shared view:/ })
      .click()
    await page
      .getByRole("option", {
        name: "Tally Marks Shared",
        exact: true,
      })
      .click()
    mkdirSync("__screenshots__", { recursive: true })
    await page.screenshot({
      path: `__screenshots__/device-variants-${testInfo.project.name}-before.png`,
      fullPage: true,
    })
    await page
      .getByRole("checkbox", {
        name: "Customize this view on this device",
        exact: true,
      })
      .check()
    await page
      .getByLabel("Variant name", { exact: true })
      .fill("Tally Marks · Practice")
    await page
      .getByRole("button", {
        name: "Tally Marks",
        exact: true,
      })
      .click()
    await page
      .getByRole("button", { name: /^Data:/ })
      .click()
    await page
      .getByRole("option", {
        name: "Room one points",
        exact: true,
      })
      .click()
    await page
      .getByRole("button", {
        name: "Customize Keep the board visible during scans",
        exact: true,
      })
      .click()
    await page
      .getByRole("checkbox", {
        name: "Keep the board visible during scans",
        exact: true,
      })
      .check()
    await page
      .getByRole("button", {
        name: "Save device",
        exact: true,
      })
      .click()
    await expect(
      page.getByRole("status", {
        name: "Management status",
      }),
    ).toHaveText("Device saved. Changes are live.")
    await expect(
      first.locator(
        ".kids-points-total strong:not([aria-hidden=true])",
      ),
    ).toHaveText("123")
    await expect(
      second.locator(
        ".kids-points-total strong:not([aria-hidden=true])",
      ),
    ).toHaveText("999")
    await expect(
      page.getByText("No unsaved changes", { exact: true }),
    ).toBeVisible()
    if (testInfo.project.name !== "chromium-narrow")
      await expect(
        page
          .frameLocator(
            'iframe[title="E2E Square browser preview"]',
          )
          .locator(
            ".kids-points-total strong:not([aria-hidden=true])",
          ),
      ).toHaveText("123")
    await page.screenshot({
      path: `__screenshots__/device-variants-${testInfo.project.name}-after.png`,
      fullPage: true,
    })
    const persisted = (await (
      await request.get("/api/manage/devices")
    ).json()) as { devices: Device[] }
    const customized = persisted.devices.find(
      (device: { id: string }) =>
        device.id === "e2e-square",
    )
    expect(customized?.viewOverrides?.[viewId]).toEqual({
      name: "Tally Marks · Practice",
      panels: {
        board: {
          bindings: { data: "variants/one" },
          settings: { isAllChildrenVisible: true },
        },
      },
    })
    const other = persisted.devices.find(
      (device: { id: string }) =>
        device.id === "e2e-stream",
    )
    if (!other)
      throw new Error("Missing second fixture device")
    const response = await request.put(
      "/api/manage/devices/e2e-stream",
      {
        data: {
          ...other,
          viewOverrides: {
            [viewId]: {
              panels: {
                board: {
                  bindings: { data: "variants/two" },
                  settings: { isAllChildrenVisible: true },
                },
              },
            },
          },
        },
      },
    )
    expect(await response.json()).toEqual({
      isRestarting: false,
    })
    await expect(
      second.locator(
        ".kids-points-total strong:not([aria-hidden=true])",
      ),
    ).toHaveText("321")
    expect(
      (
        await request.post("/__test__/mqtt", {
          data: {
            topic: "castkit/channels/variants/two/set",
            payload: {
              ...points(331),
              lastScan: {
                kidId: "robin",
                reader: "Second room reader",
                result: "awarded",
                atMs: Date.now(),
                points: 10,
                taskName: "Reading",
              },
            },
          },
        })
      ).ok(),
    ).toBe(true)
    await expect(
      second.locator(
        '.kids-points-card[data-scanned="true"]',
      ),
    ).toHaveCount(1)
    await expect(
      first.locator(
        '.kids-points-card[data-scanned="true"]',
      ),
    ).toHaveCount(0)
    await expect(
      first.locator(
        ".kids-points-total strong:not([aria-hidden=true])",
      ),
    ).toHaveText("123")
    const practice = points(123)
    expect(
      (
        await request.post("/__test__/mqtt", {
          data: {
            topic: "castkit/channels/variants/one/set",
            payload: {
              ...practice,
              kids: practice.kids.map((kid) => ({
                ...kid,
                activeTask: {
                  name: "Piano",
                  reader: "Practice reader",
                  startedAtMs: Date.now() - 5 * 60_000,
                  bankedMinutes: 0,
                  isCountdown: false,
                },
              })),
            },
          },
        })
      ).ok(),
    ).toBe(true)
    await expect(
      first.getByText("Piano", { exact: true }),
    ).toBeVisible()
    await expect(
      second.getByText("Piano", { exact: true }),
    ).toHaveCount(0)
    const navigationDevices = (await (
      await request.get("/api/manage/devices")
    ).json()) as { devices: Device[] }
    await devices.reduce<Promise<void>>(
      async (previous, original) => {
        await previous
        const current = navigationDevices.devices.find(
          (candidate) => candidate.id === original.id,
        )
        if (!current) {
          throw new Error(
            "Missing navigation fixture device",
          )
        }
        const update = await request.put(
          `/api/manage/devices/${original.id}`,
          {
            data: {
              ...current,
              hasViewDrawer: true,
              views: ["Now Playing", view.name],
              externalViews: [
                {
                  name: view.name,
                  url: new URL(
                    `/view/${viewId}`,
                    first.url(),
                  ).href,
                },
              ],
            },
          },
        )
        expect(await update.json()).toEqual({
          isRestarting: false,
        })
        expect(
          (
            await request.put(
              `/api/manage/platform/device-screens/${original.id}`,
              { data: { screenId: null } },
            )
          ).ok(),
        ).toBe(true)
      },
      Promise.resolve(),
    )
    await first.reload()
    await second.reload()
    await first
      .getByRole("button", {
        name: "Open views from left edge",
        exact: true,
      })
      .click()
    await first
      .getByRole("button", { name: view.name, exact: true })
      .click()
    await second
      .getByRole("button", {
        name: "Open views from left edge",
        exact: true,
      })
      .click()
    await second
      .getByRole("button", { name: view.name, exact: true })
      .click()
    const manualResponse = await request.get(
      `/api/display/view/${viewId}?device=e2e-square`,
    )
    expect(
      manualResponse.status(),
      await manualResponse.text(),
    ).toBe(200)
    await expect(
      first.locator("main.platform"),
    ).toHaveAttribute("data-connection", "connected")
    await expect(
      second.locator("main.platform"),
    ).toHaveAttribute("data-connection", "connected")
    await expect(
      first.locator(".kids-points-activity-total strong"),
    ).toHaveText("123")
    await expect(
      second.locator(
        ".kids-points-total strong:not([aria-hidden=true])",
      ),
    ).toHaveText("331")
    await expect(
      first.getByText("Piano", { exact: true }),
    ).toBeVisible()
    await expect(
      second.getByText("Piano", { exact: true }),
    ).toHaveCount(0)
    await first.screenshot({
      path: `__screenshots__/device-variants-${testInfo.project.name}-manual-one.png`,
      fullPage: true,
    })
    await second.screenshot({
      path: `__screenshots__/device-variants-${testInfo.project.name}-manual-two.png`,
      fullPage: true,
    })
    expect(
      (
        await request.post("/__test__/mqtt", {
          data: {
            topic: "castkit/channels/variants/one/set",
            payload: {
              ...points(124),
              lastScan: {
                kidId: "robin",
                reader: "First room reader",
                result: "awarded",
                atMs: Date.now(),
                points: 1,
                taskName: "Practice",
              },
            },
          },
        })
      ).ok(),
    ).toBe(true)
    await expect(
      first.locator(
        ".kids-points-total strong:not([aria-hidden=true])",
      ),
    ).toHaveText("124")
    await expect(
      second.locator(
        ".kids-points-total strong:not([aria-hidden=true])",
      ),
    ).toHaveText("331")
    await expect(
      first.locator(
        '.kids-points-card[data-scanned="true"]',
      ),
    ).toHaveCount(1)
    const updateNavigation = async ({
      name,
      path,
    }: {
      name: string
      path: string
    }) => {
      const currentRegistry = (await (
        await request.get("/api/manage/devices")
      ).json()) as { devices: Device[] }
      const current = currentRegistry.devices.find(
        (candidate) => candidate.id === "e2e-square",
      )
      if (!current) {
        throw new Error("Missing navigation fixture")
      }
      expect(
        (
          await request.put(
            "/api/manage/devices/e2e-square",
            {
              data: {
                ...current,
                views: [name, "Now Playing"],
                externalViews: [
                  {
                    name,
                    url: new URL(path, first.url()).href,
                  },
                ],
              },
            },
          )
        ).ok(),
      ).toBe(true)
      await expect(
        first.locator("main.platform"),
      ).toHaveAttribute("data-connection", "connected")
      await expect(
        first.locator(
          ".kids-points-total strong:not([aria-hidden=true])",
        ),
      ).toHaveText("124")
      await first.reload()
      await expect(
        first.locator(
          ".kids-points-total strong:not([aria-hidden=true])",
        ),
      ).toHaveText("124")
      await expect(
        first.locator("main.platform"),
      ).toHaveAttribute("data-connection", "connected")
    }
    await updateNavigation({
      name: "Tally Marks Renamed",
      path: `/view/${viewId}`,
    })
    await updateNavigation({
      name: "Tally Marks Screen",
      path: "/screen/variant-screen",
    })
    await updateNavigation({
      name: view.name,
      path: `/view/${viewId}`,
    })
    await page.reload()
    await expect(
      page.getByRole("checkbox", {
        name: "Customize this view on this device",
        exact: true,
      }),
    ).toBeChecked()
    await expect(
      page.getByLabel("Variant name", { exact: true }),
    ).toHaveValue("Tally Marks · Practice")
    await page
      .getByRole("checkbox", {
        name: "Customize this view on this device",
        exact: true,
      })
      .uncheck()
    await page
      .getByRole("button", {
        name: "Save device",
        exact: true,
      })
      .click()
    await expect(
      page.getByRole("status", {
        name: "Management status",
      }),
    ).toHaveText("Device saved. Changes are live.")
    await expect(
      first.locator(
        ".kids-points-total strong:not([aria-hidden=true])",
      ),
    ).toHaveText("999")
    await expect(
      second.locator(
        ".kids-points-total strong:not([aria-hidden=true])",
      ),
    ).toHaveText("331")
    const restored = (await (
      await request.get("/api/manage/devices")
    ).json()) as { devices: Device[] }
    expect(
      restored.devices.find(
        (device: { id: string }) =>
          device.id === "e2e-square",
      )?.viewOverrides,
    ).toBeUndefined()
    expect(
      (
        await (
          await request.get("/api/manage/platform")
        ).json()
      ).views.find(
        (candidate: { id: string }) =>
          candidate.id === viewId,
      ),
    ).toMatchObject(view)
  } finally {
    await first.close()
    await second.close()
    await devices.reduce<Promise<void>>(
      async (previous, device: { id: string }) => {
        await previous
        await request.post("/__test__/mqtt", {
          data: {
            topic: `castkit/${device.id}/view/set`,
            payload: "Now Playing",
          },
        })
        await request.put(
          `/api/manage/devices/${device.id}`,
          { data: device },
        )
        await request.put(
          `/api/manage/platform/device-screens/${device.id}`,
          {
            data: {
              screenId:
                originalPlatform.deviceScreens[device.id] ??
                null,
            },
          },
        )
      },
      Promise.resolve(),
    )
  }
})
