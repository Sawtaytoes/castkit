import { expect, test } from "@playwright/test"

// Each window owns one stateful fixture channel.
test.describe.configure({ mode: "serial" })

const providers = [
  {
    id: "claude",
    name: "Claude",
    isOk: true,
    windows: [
      {
        id: "weekly",
        label: "Weekly (all models)",
        periodHours: 168,
        percentUsed: 54,
        resetsAtMs: Date.parse("2030-01-07T12:00:00Z"),
      },
      {
        id: "session",
        label: "5-hour limit",
        periodHours: 5,
        percentUsed: 7,
        resetsAtMs: Date.parse("2030-01-01T15:00:00Z"),
      },
      {
        id: "fable",
        label: "Weekly Fable",
        periodHours: 168,
        percentUsed: 12,
        resetsAtMs: Date.parse("2030-01-07T12:00:00Z"),
      },
    ],
  },
  {
    id: "codex",
    name: "Codex 1",
    isOk: true,
    windows: [
      {
        id: "weekly",
        label: "7-day limit",
        periodHours: 168,
        percentUsed: 30,
        resetsAtMs: Date.parse("2030-01-06T12:00:00Z"),
      },
      {
        id: "session",
        label: "5-hour limit",
        periodHours: 5,
        percentUsed: 25,
        resetsAtMs: Date.parse("2030-01-01T13:00:00Z"),
      },
      {
        id: "credits",
        label: "Credits",
        usedText: "1,234.5 credits",
      },
      {
        id: "usage_limit_resets",
        label: "Usage limit resets",
        usedText: "2 available",
      },
    ],
  },
]

test("AI usage details show all limits and resets without changing the overview", async ({
  page,
  request,
}, testInfo) => {
  await request.post("/__test__/mqtt", {
    data: {
      topic: "castkit/channels/usage/fixture/set",
      payload: { providers },
    },
  })
  await page.goto("/view/usage-combined")
  const trigger = page.getByRole("button", {
    name: "Show Claude usage details",
  })
  await expect(trigger).toBeVisible()
  await expect(page.getByText("Weekly Fable")).toBeHidden()
  await page.screenshot({
    animations: "disabled",
    path: `__screenshots__/usage-overview-${testInfo.project.name}.png`,
  })
  await trigger.click()
  const details = page.getByRole("region", {
    name: "Claude usage details",
  })
  await expect(
    details.getByText("Weekly (all models)"),
  ).toBeVisible()
  await expect(
    details.getByText("5-hour limit"),
  ).toBeVisible()
  await expect(
    details.getByText("Weekly Fable"),
  ).toBeVisible()
  await expect(
    details.getByText("88%", { exact: true }),
  ).toBeVisible()
  await expect(details.getByText(/^Resets /)).toHaveCount(3)
  // Composition focus settles after its layout measurement and transition.
  await expect
    .poll(async () => {
      const detailBounds = await details.boundingBox()
      const compositionBounds = await page
        .locator(".platform-layout")
        .boundingBox()
      return detailBounds && compositionBounds
        ? detailBounds.height / compositionBounds.height
        : 0
    })
    .toBeGreaterThan(0.85)
  const bounds = await details.boundingBox()
  const viewport = page.viewportSize()
  if (!bounds || !viewport) {
    throw new Error(
      "The open usage detail view must have visible bounds",
    )
  }
  expect(bounds.width).toBeLessThanOrEqual(viewport.width)
  expect(bounds.height).toBeLessThanOrEqual(viewport.height)
  expect(await page.getByRole("dialog").count()).toBe(0)
  const layoutBounds = await page
    .locator(".platform-layout")
    .boundingBox()
  if (!layoutBounds)
    throw new Error("Missing composition bounds")
  expect(bounds.width).toBeGreaterThan(
    layoutBounds.width * 0.85,
  )
  expect(bounds.height).toBeGreaterThan(
    layoutBounds.height * 0.85,
  )
  const iconBounds = await details
    .locator(".ai-usage-provider-icon")
    .boundingBox()
  const titleBounds = await details
    .getByRole("heading", { name: "Claude" })
    .boundingBox()
  if (!iconBounds || !titleBounds)
    throw new Error("Missing subscription title bounds")
  expect(
    Math.abs(
      iconBounds.y +
        iconBounds.height / 2 -
        titleBounds.y -
        titleBounds.height / 2,
    ),
  ).toBeLessThan(1)

  await page.screenshot({
    animations: "disabled",
    path: `__screenshots__/usage-details-${testInfo.project.name}.png`,
  })
  await details
    .getByRole("button", { name: "Back to AI usage" })
    .click()
  await expect(trigger).toBeFocused()
  await trigger.press("Enter")
  await expect(details).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(details).toBeHidden()
  await page
    .getByRole("button", {
      name: "Show Codex 1 usage details",
    })
    .click()
  const codex = page.getByRole("region", {
    name: "Codex 1 usage details",
  })
  await expect(codex.getByText("7-day limit")).toBeVisible()
  await expect(
    codex.getByText("5-hour limit"),
  ).toBeVisible()
  await expect(
    codex.getByText("1,234.5 credits"),
  ).toBeVisible()
  await expect(codex.getByText("2 available")).toBeVisible()
  await expect(
    codex.getByText("Reset time unavailable"),
  ).toHaveCount(2)
  await expect(codex.getByText(/^Resets /)).toHaveCount(2)
  await page.screenshot({
    animations: "disabled",
    path: `__screenshots__/usage-codex-${testInfo.project.name}.png`,
  })
  await request.post("/__test__/mqtt", {
    data: {
      topic: "castkit/channels/usage/fixture/set",
      payload: {
        providers: providers.map((provider) => ({
          ...provider,
          windows: provider.windows.map((window) => ({
            ...window,
            percentUsed: 20,
          })),
        })),
      },
    },
  })
  await expect(
    codex.getByText("80%", { exact: true }),
  ).toHaveCount(4)
})

test("a short image-display canvas can touch-scroll to the model-specific quota", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 480, height: 320 })
  await request.post("/__test__/mqtt", {
    data: {
      topic: "castkit/channels/usage/fixture/set",
      payload: { providers },
    },
  })
  await page.goto("/view/usage")
  await page
    .getByRole("button", {
      name: "Show Claude usage details",
    })
    .click()
  const details = page.getByRole("region", {
    name: "Claude usage details",
  })
  const bounds = await details.boundingBox()
  if (!bounds) throw new Error("Missing detail bounds")
  expect(
    await details.evaluate(
      (element) =>
        element.scrollHeight > element.clientHeight,
    ),
  ).toBe(true)
  const start = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height - 40,
  }
  // This is the worker's scroll hit-test, followed by its native CDP touch path.
  expect(
    await page.evaluate(
      ({ x, y }) =>
        document
          .elementFromPoint(x, y)
          ?.closest("[data-castkit-scroll]")
          ?.getAttribute("data-castkit-target"),
      start,
    ),
  ).toBe("scroll:ai-usage:claude")
  const session = await page.context().newCDPSession(page)
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [start],
  })
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: start.x, y: start.y - 45 }],
  })
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: start.x, y: start.y - 130 }],
  })
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  })
  await expect
    .poll(() =>
      details.evaluate((element) => element.scrollTop),
    )
    .toBeGreaterThan(60)
  await expect(
    details.getByText("Weekly Fable"),
  ).toBeInViewport()
  await expect(details).toBeVisible()
  await expect(page).toHaveURL(/\/view\/usage$/)
  await session.detach()
})

test("opening another subscription from the rail transfers detail ownership", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await request.post("/__test__/mqtt", {
    data: {
      topic: "castkit/channels/usage/fixture/set",
      payload: { providers },
    },
  })
  await page.goto("/view/usage-multiple")
  await page
    .getByRole("button", {
      name: "Show Claude usage details",
    })
    .click()
  await expect(
    page.getByRole("region", {
      name: "Claude usage details",
    }),
  ).toBeVisible()
  await page
    .getByRole("button", {
      name: "Show Codex 1 usage details",
    })
    .click()
  await expect(
    page.getByRole("region", {
      name: "Claude usage details",
    }),
  ).toHaveCount(0)
  await expect(
    page.getByRole("region", {
      name: "Codex 1 usage details",
    }),
  ).toBeVisible()
  await expect(
    page.getByRole("button", {
      name: "Show Claude usage details",
    }),
  ).toBeVisible()
  await page
    .getByRole("button", { name: "Back to AI usage" })
    .click()
  await expect(
    page.getByRole("region", { name: /usage details/ }),
  ).toHaveCount(0)
  await expect(
    page.getByRole("button", {
      name: "Show Claude usage details",
    }),
  ).toBeVisible()
  await expect(
    page.getByRole("button", {
      name: "Show Codex 1 usage details",
    }),
  ).toBeVisible()
})
