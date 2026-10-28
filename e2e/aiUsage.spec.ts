import {
  expect,
  type Locator,
  test,
} from "@playwright/test"
import { seedUsageReadability } from "./__fixtures__/usageReadability.ts"

// Each window owns one stateful fixture channel.
test.describe.configure({ mode: "serial" })

// Used bar heights are quantized by browser layout; allow at most 1/16 CSS px.
const usageMetricNames = [
  "headline",
  "percentage",
  "bar",
  "reset",
] as const

const readUsageMetrics = (element: Locator) =>
  element.evaluate((root) => {
    const headline = root.querySelector(
      root.classList.contains("ai-usage-details")
        ? ".ai-usage-window-label"
        : ".ai-usage-provider-head h3",
    )
    const percentage = root.querySelector(
      ".ai-usage-window-percent",
    )
    const bar = root.querySelector(".ai-usage-bar")
    const reset = root.querySelector(
      ".ai-usage-window-reset",
    )
    if (!headline || !percentage || !bar || !reset)
      throw new Error("Missing visible usage metrics")
    return {
      scale: Number(
        getComputedStyle(root).getPropertyValue(
          "--ai-usage-scale",
        ),
      ),
      headline: Number.parseFloat(
        getComputedStyle(headline).fontSize,
      ),
      weight: getComputedStyle(headline).fontWeight,
      percentage: Number.parseFloat(
        getComputedStyle(percentage).fontSize,
      ),
      bar: Number.parseFloat(getComputedStyle(bar).height),
      reset: Number.parseFloat(
        getComputedStyle(reset).fontSize,
      ),
    }
  })

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
  // Read both bounds in one frame while the composition is expanding.
  await expect
    .poll(() =>
      details.evaluate((element) => {
        const icon = element
          .querySelector(".ai-usage-provider-icon")
          ?.getBoundingClientRect()
        const title = element
          .querySelector("h2")
          ?.getBoundingClientRect()
        if (!icon || !title)
          throw new Error(
            "Missing subscription title bounds",
          )
        return Math.abs(
          icon.y +
            icon.height / 2 -
            title.y -
            title.height / 2,
        )
      }),
    )
    .toBeLessThan(1)

  expect(
    await details.evaluate(
      (element) =>
        element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true)
  // Full reset strings must fit without creating a horizontal scroll area.
  expect(
    await details
      .locator(".ai-usage-window-reset")
      .evaluateAll((elements) =>
        elements.every(
          (element) =>
            element.scrollWidth <= element.clientWidth,
        ),
      ),
  ).toBe(true)
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

test("subscription text and bars keep the overview's dynamic proportions while resizing", async ({
  page,
  request,
}, testInfo) => {
  const originalViewport = page.viewportSize()
  if (!originalViewport)
    throw new Error("Missing browser viewport")
  await page.setViewportSize({ width: 1024, height: 600 })
  await page.route(
    "**/api/display/view/usage-proportions/media/**",
    (route) =>
      route.fulfill({
        path: "assets/sample-photos/printer-camera-chamber.jpg",
        contentType: "image/jpeg",
      }),
  )
  await seedUsageReadability({
    request: page.request,
    viewId: "usage-proportions",
  })
  await request.post("/__test__/mqtt", {
    data: {
      topic: "castkit/channels/usage/fixture/set",
      payload: {
        providers: providers.concat([
          {
            id: "codex_2",
            name: "Codex 2",
            isOk: true,
            windows: [
              {
                id: "monthly",
                label: "Monthly",
                periodHours: 720,
                percentUsed: 11,
                resetsAtMs: Date.parse(
                  "2030-02-01T12:00:00Z",
                ),
              },
            ],
          },
        ]),
      },
    },
  })
  await page.goto("/view/usage-proportions")
  await page.evaluate(() => document.fonts.ready)
  await expect
    .poll(() =>
      page
        .locator(".platform-camera img")
        .evaluate(
          (element) =>
            (element as HTMLImageElement).naturalWidth,
        ),
    )
    .toBeGreaterThan(0)
  const overview = page.locator(".ai-usage").first()
  const baseline = await readUsageMetrics(overview)
  await page
    .getByRole("button", {
      name: "Show Claude usage details",
    })
    .click()
  const details = page.getByRole("region", {
    name: "Claude usage details",
  })
  await [
    originalViewport,
    { width: 480, height: 320 },
    { width: 1024, height: 600 },
  ].reduce(async (previous, viewport) => {
    await previous
    await page.setViewportSize(viewport)
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() => resolve()),
          ),
        ),
    )
    const metrics = await readUsageMetrics(details)
    expect(metrics.scale).toBeGreaterThanOrEqual(
      baseline.scale,
    )
    expect(metrics.weight).toBe(baseline.weight)
    usageMetricNames.forEach((metric) => {
      expect(
        Math.abs(
          metrics[metric] -
            (baseline[metric] * metrics.scale) /
              baseline.scale,
        ),
        `${metric} must retain the overview's dynamic proportion`,
      ).toBeLessThanOrEqual(1 / 16)
      expect(metrics[metric]).toBeGreaterThanOrEqual(
        baseline[metric],
      )
    })
    await expect(
      details.locator(".ai-usage-window"),
    ).toHaveCount(3)
    expect(
      await details.evaluate(
        (element) =>
          element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true)
    if (viewport.height === 320)
      expect(
        await details.evaluate(
          (element) =>
            element.scrollHeight > element.clientHeight,
        ),
      ).toBe(true)
    if (viewport === originalViewport)
      await page.screenshot({
        animations: "disabled",
        path: `__screenshots__/usage-proportions-window-${testInfo.project.name}.png`,
      })
  }, Promise.resolve())
  await page.screenshot({
    animations: "disabled",
    path: `__screenshots__/usage-proportions-resized-${testInfo.project.name}.png`,
  })
  await details
    .getByRole("button", { name: "Back to AI usage" })
    .click()
  await expect(
    page.getByRole("button", {
      name: "Show Claude usage details",
    }),
  ).toBeFocused()
})

test("expanded subscription text remains as readable as the overview at 1024×600", async ({
  page,
  request,
}, testInfo) => {
  await page.setViewportSize({ width: 1024, height: 600 })
  await page.route(
    "**/api/display/view/usage-readable/media/**",
    (route) =>
      route.fulfill({
        path: "assets/sample-photos/printer-camera-chamber.jpg",
        contentType: "image/jpeg",
      }),
  )
  await seedUsageReadability({ request: page.request })
  await request.post("/__test__/mqtt", {
    data: {
      topic: "castkit/channels/usage/fixture/set",
      payload: {
        providers: providers.concat([
          {
            id: "codex_2",
            name: "Codex 2",
            isOk: true,
            windows: [
              {
                id: "monthly",
                label: "Monthly",
                periodHours: 720,
                percentUsed: 11,
                resetsAtMs: Date.parse(
                  "2030-02-01T12:00:00Z",
                ),
              },
            ],
          },
        ]),
      },
    },
  })
  await page.goto("/view/usage-readable")
  const overview = page
    .locator(".ai-usage-provider")
    .filter({
      has: page.getByRole("button", {
        name: "Show Claude usage details",
      }),
    })
  await expect(overview).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  const camera = page.locator(".platform-camera img")
  await expect
    .poll(
      () =>
        camera.evaluate(
          (element) =>
            (element as HTMLImageElement).naturalWidth,
        ),
      {
        message: `Fixture camera must load: ${await camera.getAttribute("src")}`,
      },
    )
    .toBeGreaterThan(0)
  const fontSize = (selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((element) =>
        Number.parseFloat(
          getComputedStyle(element).fontSize,
        ),
      )
  // Wait for row budgeting before comparing the overview's actual type scale.
  await expect
    .poll(() => fontSize(".ai-usage-provider-head h3"))
    .toBeGreaterThan(24)
  const overviewTitle = await fontSize(
    ".ai-usage-provider-head h3",
  )
  const overviewIcon = await overview
    .locator(".ai-usage-provider-icon")
    .evaluate(
      (element) => element.getBoundingClientRect().height,
    )
  const overviewPercent = await fontSize(
    ".ai-usage-provider-head .ai-usage-window-percent",
  )
  const overviewReset = await fontSize(
    ".ai-usage-window-reset",
  )
  const overviewMetrics = await readUsageMetrics(
    page.locator(".ai-usage").first(),
  )
  await page.screenshot({
    animations: "disabled",
    path: `__screenshots__/usage-readable-overview-${testInfo.project.name}.png`,
  })
  await overview.getByRole("button").click()
  const details = page.getByRole("region", {
    name: "Claude usage details",
  })
  await expect
    .poll(
      async () => (await details.boundingBox())?.width ?? 0,
    )
    .toBeGreaterThan(900)
  await page.screenshot({
    animations: "disabled",
    path: `__screenshots__/usage-readable-claude-${testInfo.project.name}.png`,
  })
  expect(
    await fontSize(".ai-usage-details h2"),
  ).toBeGreaterThanOrEqual(overviewTitle)
  expect(
    await details
      .locator(".ai-usage-provider-icon")
      .evaluate(
        (element) => element.getBoundingClientRect().height,
      ),
  ).toBeGreaterThanOrEqual(overviewIcon)
  const detailMetrics = await readUsageMetrics(details)
  expect(detailMetrics.weight).toBe(overviewMetrics.weight)
  usageMetricNames.forEach((metric) => {
    expect(
      Math.abs(
        detailMetrics[metric] -
          (overviewMetrics[metric] * detailMetrics.scale) /
            overviewMetrics.scale,
      ),
      `${metric} must retain the overview's dynamic proportion`,
    ).toBeLessThanOrEqual(1 / 16)
    expect(detailMetrics[metric]).toBeGreaterThanOrEqual(
      overviewMetrics[metric],
    )
  })
  expect(
    await fontSize(
      ".ai-usage-details .ai-usage-window-percent",
    ),
  ).toBeGreaterThanOrEqual(overviewPercent)
  expect(
    await fontSize(
      ".ai-usage-details .ai-usage-window-reset",
    ),
  ).toBeGreaterThanOrEqual(overviewReset)
  await expect(
    details.getByText("Weekly (all models)"),
  ).toBeInViewport()
  await expect(
    details.getByText("5-hour limit"),
  ).toBeInViewport()
  await expect(
    details.getByText("Weekly Fable"),
  ).toBeInViewport()
  await expect(
    details.locator(".ai-usage-window-reset").last(),
  ).toBeInViewport()
  expect(
    await details.evaluate(
      (element) =>
        element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true)
  await details
    .getByRole("button", { name: "Back to AI usage" })
    .click()
  await page
    .getByRole("button", {
      name: "Show Codex 1 usage details",
    })
    .click()
  await expect(
    page.getByRole("region", {
      name: "Codex 1 usage details",
    }),
  ).toBeVisible()
  expect(
    await fontSize(
      ".ai-usage-details .ai-usage-window-foot",
    ),
  ).toBeGreaterThanOrEqual(overviewReset)
  expect(
    await page
      .getByText("1,234.5 credits")
      .evaluate((element) =>
        Number.parseFloat(
          getComputedStyle(element).fontSize,
        ),
      ),
  ).toBeGreaterThanOrEqual(overviewReset)
  expect(
    await page
      .getByText("2 available")
      .evaluate((element) =>
        Number.parseFloat(
          getComputedStyle(element).fontSize,
        ),
      ),
  ).toBeGreaterThanOrEqual(overviewReset)
  await expect(
    page.getByText("1,234.5 credits"),
  ).toBeVisible()
  await expect(page.getByText("2 available")).toBeVisible()
  await page.screenshot({
    animations: "disabled",
    path: `__screenshots__/usage-readable-codex-${testInfo.project.name}.png`,
  })
  const codex = page.getByRole("region", {
    name: "Codex 1 usage details",
  })
  await codex.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect(
    codex.getByText("2 available"),
  ).toBeInViewport()
  await page.screenshot({
    animations: "disabled",
    path: `__screenshots__/usage-readable-codex-more-${testInfo.project.name}.png`,
  })
})
