import { expect, test } from "@playwright/test"

const views = [
  "Overview",
  "Workshop activity and printer cameras",
  "Media playback and upcoming schedule",
].map((name, index) => ({
  id: `example-${index}`,
  name,
  layout: "single",
  panels: [],
  theme: "auto",
  access: "pin",
  hasPin: false,
  isControlEnabled: false,
}))
const platform = {
  sources: [],
  channels: [],
  views,
  screens: [],
  adapters: [],
  viewSpecs: [],
  presets: [],
  plugins: [],
  channelStates: {},
  deviceScreens: {},
}

const sizes = [
  { width: 390, zoom: 1 },
  { width: 1024, zoom: 1 },
  { width: 1440, zoom: 1 },
  { width: 2560, zoom: 1 },
  { width: 1440, zoom: 2 },
  { width: 2560, zoom: 2 },
]

sizes.forEach(({ width, zoom }) => {
  test(`management layout stays within its column at ${width}px and ${zoom}x zoom`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.route("**/api/access/session", (route) =>
      route.fulfill({
        json: {
          isAuthenticated: false,
          isSetupRequired: false,
        },
      }),
    )
    await page.route("**/api/manage/platform", (route) =>
      route.fulfill({ json: platform }),
    )
    await page.goto("/manage")
    await page.evaluate((scale) => {
      document.documentElement.style.zoom = String(scale)
    }, zoom)
    const pin = page.getByLabel(/^Management PIN/)
    await expect(pin).toBeVisible()
    await expect(
      page.getByRole("heading", {
        name: "Sign in",
        exact: true,
        level: 1,
      }),
    ).toBeVisible()
    await expect(
      page.getByRole("navigation", {
        name: "CastKit management",
      }),
    ).toHaveCount(0)
    await expect(
      page.getByRole("region", {
        name: "Machine API access",
      }),
    ).toHaveCount(0)
    await expect(
      page.getByRole("region", {
        name: "View and screen access",
      }),
    ).toHaveCount(0)
    await expect
      .poll(
        async () => (await pin.boundingBox())?.width ?? 0,
      )
      .toBeGreaterThan(width < 600 ? 250 : 450)
    const card = page.getByRole("region", {
      name: "Sign in to CastKit",
    })
    const inputBounds = await pin.boundingBox()
    const cardBounds = await card.boundingBox()
    if (!inputBounds || !cardBounds)
      throw new Error("Login bounds are missing")
    expect(inputBounds.x).toBeGreaterThanOrEqual(
      cardBounds.x,
    )
    expect(
      inputBounds.x + inputBounds.width,
    ).toBeLessThanOrEqual(cardBounds.x + cardBounds.width)
    await page.goto("/manage/")
    await expect(pin).toBeVisible()
    await expect
      .poll(
        async () => (await pin.boundingBox())?.width ?? 0,
      )
      .toBeGreaterThan(width < 600 ? 250 : 450)
    await page.unroute("**/api/access/session")
    await page.route("**/api/access/session", (route) =>
      route.fulfill({
        json: {
          isAuthenticated: true,
          isSetupRequired: false,
        },
      }),
    )
    await page.goto("/manage/views")
    await page.evaluate((scale) => {
      document.documentElement.style.zoom = String(scale)
    }, zoom)
    const selection = page.getByRole("button", {
      name: "Choose from 3 views",
      exact: true,
    })
    await selection.focus()
    await page.keyboard.press("Enter")
    await page
      .getByPlaceholder("Search views by name, ID, or tag")
      .fill("Workshop")
    await page
      .getByPlaceholder("Search views by name, ID, or tag")
      .press("Enter")
    await expect(
      page.getByRole("img", {
        name: "PIN protected; PIN not set",
      }),
    ).toHaveCount(0)
    await expect(page.getByLabel(/^View name/)).toHaveValue(
      views[1]?.name,
    )
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          innerWidth,
      ),
    ).toBe(true)
  })
})
