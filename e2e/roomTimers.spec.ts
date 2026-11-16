import { expect, test } from "@playwright/test"

test("room timer priority, controls, and promotion use the real socket", async ({
  page,
  request,
}, testInfo) => {
  const now = Date.now()
  const entities = [600, 300, 450].map((seconds) => ({
    id: `timer.${seconds}.r1`,
    name: `Tea ${seconds} · Lounge`,
    domain: "timer",
    state: "active",
    attributes: {
      room: "lounge",
      finishes_at: new Date(
        now + seconds * 1000,
      ).toISOString(),
    },
    actions: ["pause", "cancel", "add_5_minutes"],
  }))
  const publish = async (items: typeof entities) =>
    request.post("/__test__/mqtt", {
      data: {
        topic: "castkit/channels/timers/fixture/set",
        payload: { entities: items },
      },
    })
  await publish(entities)
  await page.goto("/view/timers-legacy")
  await expect(
    page.getByText("Tea 300 · Lounge", { exact: true }),
  ).toBeVisible()
  await page.screenshot({
    path: `docs/images/timer-extension-legacy-${testInfo.project.name}.png`,
  })
  await page.goto("/view/timers-priority")
  await expect(
    page.locator(".timer-priority-card").first(),
  ).toContainText("Tea 300")
  await expect(
    page.locator(".timer-priority-card"),
  ).toHaveCount(3)
  await page.screenshot({
    path: `docs/images/timer-extension-after-${testInfo.project.name}.png`,
  })
  await page
    .getByRole("button", {
      name: "Add 5 minutes",
      exact: true,
    })
    .first()
    .click()
  await expect
    .poll(async () =>
      (
        await (
          await request.get("/__test__/published")
        ).json()
      ).some(
        (item: { topic: string; payload: string }) =>
          item.topic === "fixture/timers/command" &&
          JSON.parse(item.payload).action ===
            "add_5_minutes" &&
          JSON.parse(item.payload).entityId ===
            "timer.300.r1",
      ),
    )
    .toBe(true)
  await page
    .getByRole("button", { name: "Pause", exact: true })
    .first()
    .click()
  await expect
    .poll(async () =>
      (
        await (
          await request.get("/__test__/published")
        ).json()
      ).some(
        (item: { topic: string; payload: string }) =>
          item.topic === "fixture/timers/command" &&
          JSON.parse(item.payload).action === "pause" &&
          JSON.parse(item.payload).entityId ===
            "timer.300.r1",
      ),
    )
    .toBe(true)
  await page
    .getByRole("button", { name: "Cancel", exact: true })
    .first()
    .click()
  await publish(
    entities.filter(
      (entity) => entity.id !== "timer.300.r1",
    ),
  )
  await expect(
    page.locator(".timer-priority-card").first(),
  ).toContainText("Tea 450")
})

test("room timer cards read from across a room, keep distinct colors, and hold a cancelled timer as Undo", async ({
  page,
  request,
}, testInfo) => {
  const now = Date.now()
  const timer = ({
    id,
    label,
    room,
    state = "active",
    totalSeconds,
    leftSeconds,
    kind = "duration",
    extra = {},
    actions,
  }: {
    id: string
    label: string
    room: string
    state?: string
    totalSeconds: number
    leftSeconds: number
    kind?: string
    extra?: Record<string, unknown>
    actions: string[]
  }) => ({
    id,
    name: `${label} · ${room}`,
    domain: "timer",
    state,
    attributes: {
      room: "lounge",
      label,
      kind,
      duration: `0:${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:00`,
      remaining: `0:${String(Math.floor(leftSeconds / 60)).padStart(2, "0")}:${String(leftSeconds % 60).padStart(2, "0")}`,
      finishes_at:
        state === "paused"
          ? null
          : new Date(
              now + leftSeconds * 1000,
            ).toISOString(),
      ...extra,
    },
    actions,
  })
  const tea = timer({
    id: "timer.tea.r1",
    label: "Tea",
    room: "Lounge",
    totalSeconds: 1500,
    leftSeconds: 400,
    actions: ["pause", "start", "cancel", "add_5_minutes"],
  })
  const bus = timer({
    id: "timer.bus.r1",
    label: "Bus",
    room: "Everywhere",
    kind: "end_time",
    totalSeconds: 2700,
    leftSeconds: 1100,
    actions: ["cancel", "add_5_minutes"],
  })
  const reading = timer({
    id: "timer.reading.r2",
    label: "Reading",
    room: "Lounge",
    state: "paused",
    totalSeconds: 1200,
    leftSeconds: 750,
    actions: ["start", "cancel", "add_5_minutes"],
  })
  const publish = async (items: unknown[]) =>
    request.post("/__test__/mqtt", {
      data: {
        topic: "castkit/channels/timers/fixture/set",
        payload: { entities: items },
      },
    })
  const capture = async (name: string) => {
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({
      path: `docs/images/room-timer-cards-${name}-${testInfo.project.name}.png`,
    })
  }
  await publish([tea])
  await page.goto("/view/timers-priority")
  const cards = page.locator(".timer-priority-card")
  await expect(cards).toHaveCount(1)
  await expect(cards.first().locator("h2")).toHaveText(
    "Tea",
  )
  await expect(cards.first()).toContainText("Lounge")
  await expect(cards.first()).toContainText("Ends ")
  // The Pause, +5 and Cancel buttons are finger-sized on every window.
  for (const name of ["Pause", "Add 5 minutes", "Cancel"]) {
    const box = await page
      .getByRole("button", { name, exact: true })
      .boundingBox()
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(48)
  }
  await capture("one")
  await page.setViewportSize({ width: 480, height: 480 })
  await expect(cards).toHaveCount(1)
  await capture("one-presto")

  await publish([tea, bus])
  await expect(cards).toHaveCount(2)
  const colors = await cards.evaluateAll((elements) =>
    elements.map((element) =>
      getComputedStyle(element).getPropertyValue(
        "--timer-fill-top",
      ),
    ),
  )
  expect(new Set(colors).size).toBe(2)
  // An end-time timer has no Pause.
  await expect(
    cards.nth(1).getByRole("button", { name: "Pause" }),
  ).toHaveCount(0)
  await capture("two-presto")

  await publish([reading])
  await expect(cards.first()).toContainText("Paused")
  await expect(
    page.getByRole("button", {
      name: "Resume",
      exact: true,
    }),
  ).toBeVisible()
  await capture("paused-presto")

  await publish([
    {
      ...tea,
      id: "timer.tea.r2",
      state: "canceling",
      attributes: {
        ...tea.attributes,
        cancels_at: new Date(now + 30_000).toISOString(),
      },
      actions: ["undo_cancel"],
    },
    bus,
  ])
  await expect(cards.first()).toContainText("Cancelled")
  await capture("undo-presto")
  await page
    .getByRole("button", {
      name: "Undo cancel of Tea",
      exact: true,
    })
    .click()
  await expect
    .poll(async () =>
      (
        await (
          await request.get("/__test__/published")
        ).json()
      ).some(
        (item: { topic: string; payload: string }) =>
          item.topic === "fixture/timers/command" &&
          JSON.parse(item.payload).action ===
            "undo_cancel" &&
          JSON.parse(item.payload).entityId ===
            "timer.tea.r2",
      ),
    )
    .toBe(true)
})
