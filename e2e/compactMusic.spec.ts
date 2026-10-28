import { expect, type Page, test } from "@playwright/test"
import { buildMusicPlayer } from "../packages/slatecast/src/__fixtures__/buildMusicPlayer.ts"

async function expectSettledOverview(
  page: Page,
  panelCount: number,
) {
  await expect
    .poll(() =>
      page.evaluate(async (expectedCount) => {
        await document.fonts.ready
        const readPanels = () =>
          Array.from(
            document.querySelectorAll(".platform-panel"),
          )
            .filter((panel) => panel.checkVisibility())
            .map((panel) => ({
              spec: panel.getAttribute("data-spec"),
              bounds: panel
                .getBoundingClientRect()
                .toJSON() as {
                left: number
                right: number
                top: number
                bottom: number
              },
            }))
        const before = readPanels()
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() => resolve()),
          ),
        )
        const after = readPanels()
        const errors: string[] = []
        if (after.length !== expectedCount)
          errors.push(
            `Expected ${expectedCount} panels, got ${after.length}`,
          )
        if (
          JSON.stringify(before) !== JSON.stringify(after)
        )
          errors.push("Panel bounds are still moving")
        if (
          document
            .getAnimations()
            .some(
              (animation) =>
                animation.playState === "running" &&
                Number.isFinite(
                  animation.effect?.getComputedTiming()
                    .endTime,
                ),
            )
        )
          errors.push("A finite animation is still running")
        for (const [index, panel] of after.entries()) {
          const bounds = panel.bounds
          if (
            bounds.left < -1 ||
            bounds.top < -1 ||
            bounds.right > innerWidth + 1 ||
            bounds.bottom > innerHeight + 1
          )
            errors.push(
              `${panel.spec} is outside the viewport`,
            )
          for (const other of after.slice(index + 1)) {
            if (
              Math.min(bounds.right, other.bounds.right) -
                Math.max(bounds.left, other.bounds.left) >
                1 &&
              Math.min(bounds.bottom, other.bounds.bottom) -
                Math.max(bounds.top, other.bounds.top) >
                1
            )
              errors.push(
                `${panel.spec} overlaps ${other.spec}`,
              )
          }
        }
        return errors
      }, panelCount),
    )
    .toEqual([])
}

// Mirror the saved adaptive desk composition and item selections with invented data.
test("desk music expands to its queue, returns, and retains a paused track", async ({
  page,
}, testInfo) => {
  // All projects assert geometry; one canonical project writes shared evidence.
  const capture = async (name: string) => {
    if (testInfo.project.name === "chromium-narrow")
      await page.screenshot({
        path: `__screenshots__/compact-music/${name}.png`,
      })
  }
  await page.route(
    "**/api/display/view/compact-desk/media/**",
    (route) =>
      route.fulfill({
        path: new URL(
          route.request().url().includes("/compact-prints/")
            ? "../assets/sample-photos/printer-camera-chamber.jpg"
            : "../assets/sample-photos/landscape-color.jpg",
          import.meta.url,
        ).pathname,
        contentType: "image/jpeg",
      }),
  )
  const request = page.request
  expect(
    (
      await request.post("/api/access/login", {
        data: { pin: "2468" },
      })
    ).ok(),
  ).toBe(true)
  const music = buildMusicPlayer({ nowMs: Date.now() })
  const channels = [
    {
      id: "compact-music",
      type: "music-player.v1",
      data: music,
    },
    {
      id: "compact-points",
      type: "kids-points.v1",
      data: {
        kids: ["Robin", "Sky", "Quinn"].map((name) => ({
          id: name,
          name,
          pointsToday: 130,
          goal: 400,
        })),
      },
    },
    {
      id: "compact-usage",
      type: "ai-usage.v1",
      data: {
        providers: ["claude", "codex", "codex_2"].map(
          (id) => ({
            id,
            name: id,
            isOk: true,
            windows: [
              {
                id:
                  id === "claude"
                    ? "weekly_all"
                    : "primary",
                label: "Weekly",
                percentUsed: 30,
                periodHours: 168,
              },
            ],
          }),
        ),
      },
    },
    {
      id: "compact-prints",
      type: "printers.v1",
      data: {
        printers: [
          {
            id: "printer-one",
            name: "Printer One",
            jobName: "Desk stand",
            state: "printing",
            percent: 30,
            cameraPath:
              "/sample-photos/landscape-color.jpg",
          },
        ],
      },
    },
    {
      id: "compact-rips",
      type: "rip-deck.v1",
      data: { isPresent: false, activeCount: 0, bays: [] },
    },
  ]
  for (const channel of channels) {
    expect(
      (
        await request.post(
          "/api/manage/platform/channels",
          {
            data: {
              id: channel.id,
              name: channel.id,
              sourceId: "events",
              type: channel.type,
              settings: {
                actions: [
                  "play_pause",
                  "next",
                  "previous",
                  "play_item",
                  "seek",
                ],
                commandTopic: `castkit/channels/${channel.id}/command`,
              },
            },
          },
        )
      ).ok(),
    ).toBe(true)
    expect(
      (
        await request.post("/__test__/mqtt", {
          data: {
            topic: `castkit/channels/${channel.id}/set`,
            payload: channel.data,
          },
        })
      ).ok(),
    ).toBe(true)
  }
  const view = {
    id: "compact-desk",
    name: "Desk overview",
    layout: "adaptive",
    theme: "dark",
    access: "public",
    isControlEnabled: true,
    isActiveOnly: true,
    panels: [
      {
        id: "printers",
        specId: "printer-status",
        bindings: { data: "compact-prints" },
        settings: {
          isCameraVisible: true,
          isCompactControls: true,
          isCompactFacts: true,
          priority: 3,
          isFilamentVisible: false,
        },
      },
      {
        id: "rips",
        specId: "rip-deck",
        bindings: { data: "compact-rips" },
        settings: { presentation: "posters", priority: 2 },
      },
      {
        id: "ai",
        specId: "ai-usage",
        bindings: { data: "compact-usage" },
        settings: {
          priority: 1,
          isProviderSelectionEnabled: true,
          providerIds: ["claude", "codex", "codex_2"],
          isWindowSelectionEnabled: true,
          windowIds: [
            "claude:weekly_all",
            "claude:session_5h",
            "codex:primary",
            "codex_2:primary",
          ],
          isPositiveUsageOnly: true,
          isAlertReplacementEnabled: true,
          alertPercent: 80,
        },
      },
      {
        id: "points",
        specId: "kids-points",
        bindings: { data: "compact-points" },
        settings: {
          scanSeconds: 15,
          isPersistentSummary: true,
        },
      },
      {
        id: "music",
        specId: "music-player",
        bindings: { data: "compact-music" },
        settings: { presentation: "compact", priority: 0 },
      },
    ],
  }
  expect(
    (
      await request.post("/api/manage/platform/views", {
        data: {
          ...view,
          panels: view.panels.filter(
            (panel) => panel.id !== "music",
          ),
        },
      })
    ).ok(),
  ).toBe(true)
  await page.goto("/view/compact-desk")
  const originalViewport = page.viewportSize()
  if (!originalViewport)
    throw new Error("Missing test viewport")
  await page.setViewportSize({ width: 1024, height: 600 })
  await expect(
    page.getByText("Desk stand", { exact: true }),
  ).toBeVisible()
  await expectSettledOverview(page, 3)
  await capture("before")
  await page.setViewportSize(originalViewport)
  expect(
    (
      await request.put(
        "/api/manage/platform/views/compact-desk",
        { data: view },
      )
    ).ok(),
  ).toBe(true)

  await expect(
    page.getByRole("button", {
      name: "Open full music player and queue",
    }),
  ).toBeVisible()
  await expect(
    page.getByText("Desk stand", { exact: true }),
  ).toBeVisible()
  // Exercise expansion and queue geometry in the project's own named window first.
  await page
    .getByRole("button", {
      name: "Open full music player and queue",
    })
    .click()
  await expect(
    page.getByRole("tab", { name: "Queue", exact: true }),
  ).toBeVisible()
  await expect(
    page.locator(".music-row").first(),
  ).toBeVisible()
  await expect
    .poll(() =>
      page
        .locator('[data-spec="music-player"]')
        .evaluate(
          (element) => element.getBoundingClientRect().top,
        ),
    )
    .toBeLessThan(50)
  await page.screenshot({
    path: `__screenshots__/compact-music/native-full-${testInfo.project.name}.png`,
  })
  await page
    .getByRole("button", { name: "Back to overview" })
    .click()
  // The physical target gets an additional exact-size exercise in every project.
  await page.setViewportSize({ width: 1024, height: 600 })
  await expect(
    page.getByRole("button", {
      name: "Open full music player and queue",
    }),
  ).toBeVisible()
  await expectSettledOverview(page, 4)
  await expect(
    page.locator(".compact-music"),
  ).toHaveAttribute("data-layout", "stacked")
  expect(
    await page
      .locator(".compact-music")
      .evaluate(
        (element) => element.getBoundingClientRect().width,
      ),
  ).toBeLessThan(720)
  // Keep the established busy compact layout (the committed busy.png baseline).
  for (const [spec, expected] of [
    [
      "printer-status",
      {
        x: 14.328,
        y: 14.328,
        width: 643.219,
        height: 461.281,
      },
    ],
    [
      "kids-points",
      {
        x: 14.328,
        y: 487.609,
        width: 995.328,
        height: 98.05,
      },
    ],
  ] as const) {
    const bounds = await page
      .locator(`[data-spec="${spec}"]`)
      .evaluate((element) => {
        const rectangle = element.getBoundingClientRect()
        return {
          x: rectangle.x,
          y: rectangle.y,
          width: rectangle.width,
          height: rectangle.height,
        }
      })
    for (const key of [
      "x",
      "y",
      "width",
      "height",
    ] as const)
      expect(bounds[key]).toBeCloseTo(expected[key], 0)
  }
  await capture("busy")
  await page
    .getByRole("button", {
      name: "Open full music player and queue",
    })
    .click()
  await expect(
    page.getByRole("tab", { name: "Queue", exact: true }),
  ).toBeVisible()
  await expect(
    page.locator(".music-row").first(),
  ).toBeVisible()
  await expect
    .poll(() =>
      page
        .locator('[data-spec="music-player"]')
        .evaluate(
          (element) =>
            element.getBoundingClientRect().width,
        ),
    )
    .toBeGreaterThan(900)
  const seek = page.getByRole("slider", { name: "Seek" })
  await expect
    .poll(() => seek.locator("i").count())
    .toBeGreaterThan(20)
  await expect
    .poll(() =>
      seek.evaluate(
        (element) => element.getBoundingClientRect().height,
      ),
    )
    .toBeGreaterThanOrEqual(44)
  await seek.hover()
  await expect(
    page.locator(".music-seek-handle"),
  ).toHaveCSS("opacity", "1")
  const seekBounds = await seek.boundingBox()
  if (!seekBounds) throw new Error("Missing seek geometry")
  await page.mouse.move(
    seekBounds.x + seekBounds.width * 0.2,
    seekBounds.y + seekBounds.height / 2,
  )
  await page.mouse.down()
  await page.mouse.move(
    seekBounds.x + seekBounds.width * 0.7,
    seekBounds.y + seekBounds.height / 2,
    { steps: 4 },
  )
  await expect(seek).toHaveAttribute(
    "aria-valuenow",
    String(
      Math.round(
        (music.current?.durationSeconds ?? 0) * 0.7,
      ),
    ),
  )
  await capture("full-seeking")
  await page.mouse.up()
  await expect
    .poll(async () => {
      const publishes = (await (
        await request.get("/__test__/published")
      ).json()) as { topic: string; payload: string }[]
      return publishes
        .filter(
          (entry) =>
            entry.topic ===
            "castkit/channels/compact-music/command",
        )
        .map((entry) => JSON.parse(entry.payload))
    })
    .toContainEqual({
      action: "seek",
      positionSeconds: Math.round(
        (music.current?.durationSeconds ?? 0) * 0.7,
      ),
    })
  await capture("full")
  await request.post("/__test__/mqtt", {
    data: {
      topic: "castkit/channels/compact-music/set",
      payload: {
        ...music,
        player: { ...music.player, state: "paused" },
      },
    },
  })
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible()
  await page
    .getByRole("button", { name: "Back to overview" })
    .click()
  await expect(
    page.getByRole("button", {
      name: "Open full music player and queue",
    }),
  ).toBeVisible()
  await expect(
    page.getByText("Paused", { exact: true }),
  ).toBeVisible()
  await page
    .getByRole("button", { name: "Play", exact: true })
    .click()
  await request.post("/__test__/mqtt", {
    data: {
      topic: "castkit/channels/compact-prints/set",
      payload: { printers: [] },
    },
  })
  await expect(
    page.locator(".kids-points-summary"),
  ).toHaveCount(0)
  await expect(
    page.getByRole("button", {
      name: "Open full music player and queue",
    }),
  ).toBeVisible()
  await expect(
    page.getByText("Quinn", { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText("Sky", { exact: true }),
  ).toBeVisible()
  await expectSettledOverview(page, 3)
  await expect(
    page.locator(".compact-music"),
  ).toHaveAttribute("data-layout", "wide")
  await expect
    .poll(() =>
      page
        .locator(".compact-music-open img")
        .evaluate(
          (image) => image.getBoundingClientRect().width,
        ),
    )
    .toBe(144)
  await expect(
    page.locator(".compact-music-row"),
  ).toHaveCount(6)
  const queueRows = page.locator(".compact-music-row")
  const positions = await queueRows.evaluateAll(
    (elements) =>
      elements.map((element) => {
        const bounds = element.getBoundingClientRect()
        return { left: bounds.left, top: bounds.top }
      }),
  )
  expect(positions[1]?.left).toBe(positions[0]?.left)
  expect(positions[1]?.top).toBeGreaterThan(
    positions[0]?.top,
  )
  expect(positions[3]?.left).toBeGreaterThan(
    positions[0]?.left,
  )
  await expect(queueRows.locator("img")).toHaveCount(6)
  await queueRows.first().click()
  const nextItem = music.queue?.items.find(
    (item) =>
      item.index === (music.queue?.currentIndex ?? 0) + 1,
  )
  if (!nextItem)
    throw new Error("Missing upcoming fixture track")
  await expect
    .poll(async () => {
      const publishes = (await (
        await request.get("/__test__/published")
      ).json()) as { topic: string; payload: string }[]
      return publishes
        .filter(
          (entry) =>
            entry.topic ===
            "castkit/channels/compact-music/command",
        )
        .map((entry) => JSON.parse(entry.payload))
    })
    .toContainEqual({
      action: "play_item",
      queueItemId: nextItem.queueItemId,
    })
  await expect
    .poll(() =>
      page
        .locator(".compact-music")
        .evaluate((element) =>
          getComputedStyle(element).getPropertyValue(
            "--music-accent",
          ),
        ),
    )
    .toMatch(/rgb\(/)
  await capture("idle")
  const publishes = await (
    await request.get("/__test__/published")
  ).json()
  expect(
    (publishes as { topic: string; payload: string }[])
      .filter(
        (publish) =>
          publish.topic ===
          "castkit/channels/compact-music/command",
      )
      .map((publish) => JSON.parse(publish.payload)),
  ).toContainEqual({ action: "play_pause" })
  await page.setViewportSize({ width: 720, height: 900 })
  await expect(
    page.getByRole("region", { name: "Upcoming music" }),
  ).toBeVisible()
  await expect(
    page.getByRole("heading", {
      name: "Quinn",
      exact: true,
    }),
  ).toBeVisible()
  await expect
    .poll(() =>
      page
        .locator(".compact-music-queue")
        .evaluate((queue) => {
          const panel = queue.closest(
            '[data-spec="music-player"]',
          )
          if (!panel) return false
          const bounds = panel.getBoundingClientRect()
          return Array.from(
            queue.querySelectorAll(".compact-music-row"),
          ).every(
            (row) =>
              row.getBoundingClientRect().bottom <=
              bounds.bottom,
          )
        }),
    )
    .toBe(true)
  await expectSettledOverview(page, 3)
  await capture("spare-queue")
  await request.post("/__test__/mqtt", {
    data: {
      topic: "castkit/channels/compact-music/set",
      payload: {
        ...music,
        player: { ...music.player, state: "idle" },
      },
    },
  })
  await expect(
    page.getByRole("button", {
      name: "Open full music player and queue",
    }),
  ).toHaveCount(0)
})
