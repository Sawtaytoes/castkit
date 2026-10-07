import { expect, type Page, test } from "@playwright/test"
import { managementPlatform } from "./__fixtures__/managementPlatform.ts"

const devices = Array.from({ length: 40 }, (_, index) => ({
  id: `example-${index}`,
  label: `Example display ${index}`,
  mac: "",
  renderer: "browser",
  width: 1024,
  height: 600,
  rotation: 0,
}))

test.beforeEach(async ({ page }) => {
  const platform = managementPlatform()
  platform.views = [
    {
      ...platform.views[0]!,
      id: "preview-lab",
      name: "Lab preview",
      tags: ["Printers"],
      panels: [
        {
          id: "main",
          specId: "printer-status",
          bindings: { data: "printers/preview" },
          settings: {},
        },
      ],
    },
    ...platform.views,
  ]
  await page.route("**/api/access/session", (route) =>
    route.fulfill({
      json: {
        isAuthenticated: true,
        isSetupRequired: false,
      },
    }),
  )
  await page.route("**/api/manage/platform", (route) =>
    route.fulfill({ json: platform }),
  )
  await page.route("**/api/manage/devices", (route) =>
    route.fulfill({ json: { devices } }),
  )
  await page.route(
    "**/api/manage/preview-profiles",
    (route) =>
      route.fulfill({
        json: {
          profiles: [
            {
              id: "browser",
              label:
                "1024 × 600 · Full color · Live browser",
              width: 1024,
              height: 600,
              delivery: "browser",
              deviceId: "example-0",
              deviceLabels: devices.map(
                (device) => device.label,
              ),
              deviceIds: devices.map((device) => device.id),
              unsupportedViews: {},
            },
          ],
        },
      }),
  )
  await page.route(
    /\/(view\/view-|d\/example-)[^/]+\?preview=1(?:&device=[^&]+)?$/,
    (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<h1>Live preview</h1><p>Sample display content</p>",
      }),
  )
})

const chooseSize = async ({
  page,
  name,
}: {
  page: Page
  name: string | RegExp
}) => {
  await page
    .getByRole("button", { name: /^Preview size:/ })
    .click()
  await page
    .getByRole("option", {
      name,
      exact: typeof name === "string",
    })
    .click()
}

test("saved previews use device, custom, and changing browser dimensions without changing assignments", async ({
  page,
}) => {
  const writes = new Set<string>()
  page.on("request", (request) => {
    if (
      ["POST", "PUT", "DELETE"].includes(request.method())
    )
      writes.add(request.url())
  })
  await page.goto("/manage/views/general?item=preview-lab")
  const frame = page.locator(".collection-preview iframe")
  await chooseSize({
    page,
    name: /1024 × 600 · Full color/,
  })
  await frame.scrollIntoViewIfNeeded()
  await expect
    .poll(() =>
      frame.evaluate((element) => ({
        width: (element as HTMLIFrameElement).contentWindow
          ?.innerWidth,
        height: (element as HTMLIFrameElement).contentWindow
          ?.innerHeight,
      })),
    )
    .toEqual({ width: 1024, height: 600 })
  await chooseSize({ page, name: "Custom size" })
  await page
    .getByLabel("Preview width", { exact: true })
    .fill("800")
  await page
    .getByLabel("Preview height", { exact: true })
    .fill("480")
  await page
    .getByLabel("Preview height", { exact: true })
    .blur()
  await frame.scrollIntoViewIfNeeded()
  await expect
    .poll(() =>
      frame.evaluate(
        (element) =>
          (element as HTMLIFrameElement).contentWindow
            ?.innerWidth,
      ),
    )
    .toBe(800)
  const handle = page.getByRole("button", {
    name: "Resize preview",
  })
  await handle.focus()
  await handle.press("ArrowRight")
  await expect(
    page.getByLabel("Preview width", { exact: true }),
  ).toHaveValue("820")
  await chooseSize({
    page,
    name: /^Current browser window/,
  })
  const original = page.viewportSize()!
  await page.setViewportSize({
    width: original.width + 40,
    height: original.height + 20,
  })
  await frame.scrollIntoViewIfNeeded()
  await expect
    .poll(() =>
      frame.evaluate((element) => ({
        width: (element as HTMLIFrameElement).contentWindow
          ?.innerWidth,
        height: (element as HTMLIFrameElement).contentWindow
          ?.innerHeight,
      })),
    )
    .toEqual({
      width: original.width + 40,
      height: original.height + 20,
    })
  expect(Array.from(writes)).toEqual([])
})

test("All Views filters tags and categories, carries live broker updates, and unloads offscreen frames", async ({
  page,
  request,
}) => {
  await request.post("/__test__/mqtt", {
    data: {
      topic: "castkit/channels/printers/preview/set",
      payload: {
        printers: [
          {
            id: "printer-a",
            name: "Lab printer",
            jobName: "First bracket",
            percent: 42,
            state: "printing",
          },
        ],
      },
    },
  })
  await page.goto("/manage/views")
  await page
    .getByRole("link", { name: "All views", exact: true })
    .click()
  await expect(page).toHaveURL(/\/manage\/views\/gallery$/)
  const gallery = page.locator(".view-gallery-grid")
  await expect
    .poll(() => gallery.locator("iframe").count())
    .toBeGreaterThan(0)
  expect(
    await gallery.locator("iframe").count(),
  ).toBeLessThan(62)
  await page
    .getByRole("button", {
      name: "Filter by tag: All tags",
    })
    .click()
  await page
    .getByRole("option", { name: "Printers", exact: true })
    .click()
  await expect(
    page.getByText("1 of 62 views", { exact: true }),
  ).toBeVisible()
  const live = page.frameLocator(
    'iframe[title="Lab preview preview"]',
  )
  await expect(
    live.getByText("First bracket", { exact: true }),
  ).toBeVisible()
  await request.post("/__test__/mqtt", {
    data: {
      topic: "castkit/channels/printers/preview/set",
      payload: {
        printers: [
          {
            id: "printer-a",
            name: "Lab printer",
            jobName: "Second bracket",
            percent: 65,
            state: "printing",
          },
        ],
      },
    },
  })
  await expect(
    live.getByText("Second bracket", { exact: true }),
  ).toBeVisible()
  await expect(
    live.getByRole("button", {
      name: "Pause",
      exact: true,
    }),
  ).toBeDisabled()
  await page
    .getByRole("button", {
      name: "Filter by tag: Printers",
    })
    .click()
  await page
    .getByRole("option", { name: "All tags", exact: true })
    .click()
  await page
    .getByRole("button", {
      name: "Category: All categories",
    })
    .click()
  await page
    .getByRole("option", {
      name: "Printer Status",
      exact: true,
    })
    .click()
  await expect(
    page.getByText("1 of 62 views", { exact: true }),
  ).toBeVisible()
  await page
    .getByRole("button", {
      name: "Category: Printer Status",
    })
    .click()
  await page
    .getByRole("option", {
      name: "All categories",
      exact: true,
    })
    .click()
  await page
    .getByRole("main")
    .evaluate((element) =>
      element.scrollTo(0, element.scrollHeight),
    )
  await expect(
    gallery.locator('iframe[title="Lab preview preview"]'),
  ).toHaveCount(0)
  await expect
    .poll(() => gallery.locator("iframe").count())
    .toBeGreaterThan(0)
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    })
    document.dispatchEvent(new Event("visibilitychange"))
  })
  await expect(gallery.locator("iframe")).toHaveCount(0)
})

test("device overview shows devices without synthetic screen cards and limits live frames", async ({
  page,
}) => {
  await page.goto("/manage/all-screens")
  await expect(
    page.getByRole("heading", { name: "Device overview" }),
  ).toBeVisible()
  await expect(
    page.getByRole("heading", {
      name: "Browser dashboard",
    }),
  ).toHaveCount(0)
  await expect
    .poll(() =>
      page.locator(".screens-grid iframe").count(),
    )
    .toBeGreaterThan(0)
  expect(
    await page.locator(".screens-grid iframe").count(),
  ).toBeLessThan(devices.length)
  await page
    .getByLabel("Find a device")
    .fill("Example display 39")
  await expect(
    page.locator(".screens-grid iframe"),
  ).toHaveCount(1)
})

test("gallery scrolling stays stable while previews recycle and controls stay readable", async ({
  page,
}) => {
  await page.goto("/manage/views/gallery")
  const search = page.getByLabel("Find a view")
  const selector = page.getByRole("button", {
    name: /^Preview size:/,
  })
  expect(
    (await search.boundingBox())?.width,
  ).toBeLessThanOrEqual(400)
  expect(
    (await selector.boundingBox())?.width,
  ).toBeLessThanOrEqual(600)
  await selector.click()
  await page
    .getByPlaceholder(
      "Search sizes, capabilities, or device names",
    )
    .fill("Example display 39")
  await expect(page.getByRole("option")).toHaveCount(1)
  await page
    .getByRole("option", { name: /1024 × 600/ })
    .click()
  const main = page.getByRole("main")
  await main.evaluate((element) =>
    element.scrollTo(0, 2200),
  )
  await expect
    .poll(() =>
      main.evaluate((element) => element.scrollTop),
    )
    .toBeGreaterThan(2000)
  const bounds = (await main.boundingBox())!
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  )
  await Array.from({ length: 16 }).reduce(
    async (previous, _) => {
      await previous
      const before = await main.evaluate(
        (element) => element.scrollTop,
      )
      await page.mouse.wheel(0, -180)
      await page.waitForTimeout(250)
      const after = await main.evaluate(
        (element) => element.scrollTop,
      )
      expect(after).toBeLessThanOrEqual(
        Math.max(0, before - 100),
      )
    },
    Promise.resolve(),
  )
  await expect
    .poll(() =>
      main.evaluate((element) => element.scrollTop),
    )
    .toBe(0)
  await page.waitForTimeout(1500)
  expect(
    await main.evaluate((element) => element.scrollTop),
  ).toBe(0)
  await expect(search).toBeVisible()
})

test("image profiles show rendered frames and explain unsupported views without opening iframes", async ({
  page,
}) => {
  await page.route(
    "**/api/manage/preview-profiles",
    (route) =>
      route.fulfill({
        json: {
          profiles: [
            {
              id: "mono",
              label:
                "200 × 200 · Black and white · Rendered image",
              width: 200,
              height: 200,
              delivery: "image",
              deviceId: "panel-one",
              deviceIds: ["panel-one", "panel-two"],
              deviceLabels: ["First panel", "Second panel"],
              unsupportedViews: {
                "preview-lab": [
                  "Printer Status changes too quickly for this display.",
                ],
              },
            },
          ],
        },
      }),
  )
  await page.route("**/api/manage/previews/**", (route) =>
    route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
        "base64",
      ),
    }),
  )
  await page.goto("/manage/views/gallery")
  await chooseSize({ page, name: /200 × 200/ })
  await expect(
    page.getByText(/Shared by 2 devices/),
  ).toBeVisible()
  await page.getByLabel("Find a view").fill("Room controls")
  await page
    .locator(".view-gallery-grid")
    .scrollIntoViewIfNeeded()
  await expect
    .poll(() =>
      page.locator(".view-gallery-grid img").count(),
    )
    .toBeGreaterThan(0)
  await expect(
    page.locator(".view-gallery-grid iframe"),
  ).toHaveCount(0)
  await page.getByLabel("Find a view").fill("Lab preview")
  await expect(
    page.getByText(
      /Unavailable on this profile: Printer Status/,
    ),
  ).toBeVisible()
  await expect(
    page.locator(".view-gallery-grid img"),
  ).toHaveCount(0)
})
