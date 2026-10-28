import { expect, test } from "@playwright/test"
import { buildMusicPlayer } from "../packages/slatecast/src/__fixtures__/buildMusicPlayer.ts"

test("Room Overview spends agenda spare space on music and preserves clock, points, actions and access", async ({
  page,
}, info) => {
  const req = page.request
  expect(
    (
      await req.post("/api/access/login", {
        data: { pin: "2468" },
      })
    ).ok(),
  ).toBe(true)
  await page.route(
    "**/api/display/view/room-idle/media/**",
    (route) =>
      route.fulfill({
        path: new URL(
          "../assets/sample-photos/landscape-color.jpg",
          import.meta.url,
        ).pathname,
        contentType: "image/jpeg",
      }),
  )
  const now = Date.now()
  const music = buildMusicPlayer({ nowMs: now })
  const events = [
    "Morning learning and library program",
    "Swimming lessons",
    "After-school practice",
  ].map((summary, index) => ({
    summary,
    startMs: now + index * 3600000,
    isAllDay: false,
  }))
  for (const entry of [
    {
      id: "room-music",
      type: "music-player.v1",
      data: music,
    },
    {
      id: "room-agenda",
      type: "agenda.v1",
      data: { events },
    },
    {
      id: "room-points",
      type: "kids-points.v1",
      data: {
        kids: ["Robin", "Sky", "Quinn"].map(
          (name, index) => ({
            id: name,
            name,
            pointsToday: 80 + index * 25,
            goal: 500,
            lastTask: "Reading",
          }),
        ),
      },
    },
    {
      id: "room-weather",
      type: "weather.v1",
      data: {
        temperatureText: "66°",
        conditionText: "Cloudy",
        condition: "cloudy",
      },
    },
  ]) {
    expect(
      (
        await req.post("/api/manage/platform/channels", {
          data: {
            id: entry.id,
            name: entry.id,
            type: entry.type,
            sourceId: "events",
            settings: {
              actions: ["play_pause", "next", "previous"],
              commandTopic: `castkit/channels/${entry.id}/command`,
            },
          },
        })
      ).ok(),
    ).toBe(true)
    expect(
      (
        await req.post("/__test__/mqtt", {
          data: {
            topic: `castkit/channels/${entry.id}/set`,
            payload: entry.data,
          },
        })
      ).ok(),
    ).toBe(true)
  }
  const view = {
    id: "room-idle",
    name: "Room Overview",
    layout: "single",
    theme: "dark",
    access: "public",
    isControlEnabled: true,
    panels: [
      {
        id: "idle",
        specId: "idle-dashboard",
        bindings: {
          data: "room-agenda",
          points: "room-points",
          weather: "room-weather",
          music: "room-music",
        },
        settings: {
          hour12: true,
          timeZone: "America/Chicago",
        },
      },
    ],
  }
  expect(
    (
      await req.post("/api/manage/platform/views", {
        data: view,
      })
    ).ok(),
  ).toBe(true)
  const native = page.viewportSize()!
  await page.setViewportSize({ width: 1024, height: 600 })
  await page.goto("/view/room-idle")
  const opener = page.getByRole("button", {
    name: "Open full music player and queue",
  })
  await expect(opener).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await expect
    .poll(() =>
      page
        .locator(".idle-dashboard-time")
        .evaluate((element) =>
          Number.parseFloat(
            getComputedStyle(element).fontSize,
          ),
        ),
    )
    .toBe(210)
  await expect(
    page.locator(".idle-dashboard-points article"),
  ).toHaveCount(3)
  for (const event of events)
    await expect(
      page.getByText(event.summary, { exact: true }),
    ).toBeVisible()
  const settle = async () => {
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const bounds = () =>
            [
              ...document.querySelectorAll(
                ".idle-dashboard-clock,.idle-dashboard-agenda,.idle-dashboard-music,.idle-dashboard-points",
              ),
            ]
              .filter((element) =>
                element.checkVisibility(),
              )
              .map((element) => ({
                name: element.className,
                rect: element
                  .getBoundingClientRect()
                  .toJSON(),
              }))
          const before = bounds()
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() =>
              requestAnimationFrame(() => resolve()),
            ),
          )
          const after = bounds()
          return {
            stable:
              JSON.stringify(before) ===
              JSON.stringify(after),
            outside: after
              .filter(
                (element) =>
                  element.rect.top < 0 ||
                  element.rect.left < 0 ||
                  element.rect.right > innerWidth ||
                  element.rect.bottom > innerHeight,
              )
              .map((element) => ({
                name: element.name,
                top: element.rect.top,
                bottom: element.rect.bottom,
              })),
            scroll: [
              ...document.querySelectorAll(
                ".platform-panel,.idle-dashboard-frame,.idle-dashboard-side,.idle-dashboard-agenda",
              ),
            ].map((element) => ({
              name: element.className,
              top: element.scrollTop,
            })),
          }
        }),
      )
      .toMatchObject({ stable: true, outside: [] })
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document
              .getAnimations()
              .filter(
                (animation) =>
                  animation.playState === "running" &&
                  Number.isFinite(
                    animation.effect?.getComputedTiming()
                      .endTime,
                  ),
              ).length,
        ),
      )
      .toBe(0)
    await expect
      .poll(() =>
        page
          .locator(".idle-dashboard-music")
          .evaluate((element) => {
            const parent = element.getBoundingClientRect(),
              card = element.querySelector(".compact-music")
            if (!card) return false
            return [
              ...element.querySelectorAll(
                "button,.compact-music-row",
              ),
            ].every((entry) => {
              const bounds = entry.getBoundingClientRect()
              return (
                bounds.left >= parent.left &&
                bounds.right <= parent.right &&
                bounds.top >= parent.top &&
                bounds.bottom <= parent.bottom
              )
            })
          }),
      )
      .toBe(true)
  }
  await settle()
  if (info.project.name === "chromium-narrow")
    await page.screenshot({
      path: "__screenshots__/compact-music/room-overview.png",
    })
  await opener.click()
  await expect(
    page.getByRole("tab", { name: "Queue", exact: true }),
  ).toBeVisible()
  await expect
    .poll(() =>
      page
        .locator(".compact-music-detail")
        .evaluate(
          (element) =>
            element.getBoundingClientRect().width,
        ),
    )
    .toBeGreaterThan(900)
  await expect
    .poll(() =>
      page.evaluate(() =>
        document
          .getAnimations()
          .every(
            (animation) =>
              animation.playState !== "running",
          ),
      ),
    )
    .toBe(true)
  if (info.project.name === "chromium-narrow")
    await page.screenshot({
      path: "__screenshots__/compact-music/room-full.png",
    })
  await page.setViewportSize(native)
  await expect(
    page.getByRole("tab", { name: "Queue", exact: true }),
  ).toBeVisible()
  await expect(
    page.locator(".music-row").first(),
  ).toBeVisible()
  await expect
    .poll(() =>
      page
        .locator(".compact-music-detail")
        .evaluate(
          (element) =>
            element.getBoundingClientRect().width,
        ),
    )
    .toBeGreaterThan(native.width * 0.8)
  await page
    .getByRole("button", { name: "Back to overview" })
    .click()
  await page.setViewportSize({ width: 1024, height: 600 })
  await expect(opener).toBeVisible()
  await req.post("/__test__/mqtt", {
    data: {
      topic: "castkit/channels/room-agenda/set",
      payload: { events: [] },
    },
  })
  await expect(
    page.getByRole("region", { name: "Upcoming music" }),
  ).toBeVisible()
  await settle()
  if (info.project.name === "chromium-narrow")
    await page.screenshot({
      path: "__screenshots__/compact-music/room-spare-queue.png",
    })
  const longEvents = events.map((element, index) => ({
    ...element,
    summary: `Event ${index + 1} has animation deliberately long description that wraps onto both available agenda lines`,
  }))
  await req.post("/__test__/mqtt", {
    data: {
      topic: "castkit/channels/room-agenda/set",
      payload: { events: longEvents },
    },
  })
  await expect(opener).toHaveCount(0)
  await expect
    .poll(() =>
      page
        .locator(".idle-dashboard-time")
        .evaluate((element) =>
          Number.parseFloat(
            getComputedStyle(element).fontSize,
          ),
        ),
    )
    .toBe(210)
  for (const event of longEvents)
    await expect(
      page.getByText(event.summary, { exact: true }),
    ).toBeVisible()
  await req.post("/__test__/mqtt", {
    data: {
      topic: "castkit/channels/room-agenda/set",
      payload: { events },
    },
  })
  await req.post("/__test__/mqtt", {
    data: {
      topic: "castkit/channels/room-music/set",
      payload: {
        ...music,
        player: { ...music.player, state: "paused" },
      },
    },
  })
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled()
  await page
    .getByRole("button", { name: "Play", exact: true })
    .click()
  await expect
    .poll(async () => {
      const publishes = (await (
        await req.get("/__test__/published")
      ).json()) as { topic: string; payload: string }[]
      return publishes
        .filter(
          (publish) =>
            publish.topic ===
            "castkit/channels/room-music/command",
        )
        .map((publish) => JSON.parse(publish.payload))
    })
    .toContainEqual({ action: "play_pause" })
  expect(
    (
      await req.put(
        "/api/manage/platform/views/room-idle",
        { data: { ...view, isControlEnabled: false } },
      )
    ).ok(),
  ).toBe(true)
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeDisabled()
  expect(
    (
      await req.post(
        "/api/display/view/room-idle/actions",
        {
          data: {
            panelId: "idle",
            input: "music",
            action: "play_pause",
          },
        },
      )
    ).status(),
  ).toBe(403)
  await req.post("/__test__/mqtt", {
    data: {
      topic: "castkit/channels/room-music/set",
      payload: {
        ...music,
        player: { ...music.player, state: "idle" },
      },
    },
  })
  await expect(opener).toHaveCount(0)
})
