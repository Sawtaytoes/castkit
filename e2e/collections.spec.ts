import { expect, test } from "@playwright/test"
import { managementPlatform } from "./__fixtures__/managementPlatform.ts"

test.beforeEach(async ({ page }) => {
  const platform = managementPlatform()
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
  await page.route(
    "**/api/manage/platform/views**",
    async (route) => {
      if (
        ["POST", "PUT"].includes(route.request().method())
      ) {
        const value = route.request().postDataJSON()
        platform.views = [
          ...platform.views.filter(
            (view) => view.id !== value.id,
          ),
          value,
        ]
      }
      await route.fulfill({ json: { ok: true } })
    },
  )
  await page.route(
    /\/(view|screen)\/[^/]+\?preview=1$/,
    (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<h1>Sample preview</h1>",
      }),
  )
})

test("compact selection searches names and tags, filters groups, and Add view focuses its new form", async ({
  page,
}) => {
  await page.goto("/manage/views")
  await page
    .getByRole("button", { name: "Choose from 61 views" })
    .click()
  await page
    .getByPlaceholder("Search views by name, ID, or tag")
    .fill("Sample view 58")
  await page
    .getByRole("option", { name: /Sample view 58/ })
    .click()
  await expect(
    page.getByRole("textbox", {
      name: "View name",
      exact: true,
    }),
  ).toHaveValue("Sample view 58")
  await page
    .getByRole("button", {
      name: "Filter by tag: All tags",
    })
    .click()
  await page
    .getByRole("option", { name: "Controls", exact: true })
    .click()
  await expect(
    page.getByText("20 of 61 views"),
  ).toBeVisible()
  await page
    .getByRole("link", { name: "Panels", exact: true })
    .click()
  await page
    .getByRole("button", { name: "Add view", exact: true })
    .click()
  await expect(
    page.getByRole("textbox", {
      name: "View name",
      exact: true,
    }),
  ).toBeFocused()
  await expect(
    page.getByRole("heading", {
      name: "New view",
      exact: true,
    }),
  ).toBeVisible()
  await page
    .getByRole("textbox", {
      name: "View name",
      exact: true,
    })
    .fill("New dashboard")
  await page
    .getByRole("link", { name: "Appearance", exact: true })
    .click()
  await page.goBack()
  await expect(
    page.getByRole("textbox", {
      name: "View name",
      exact: true,
    }),
  ).toHaveValue("New dashboard")
  await page
    .getByRole("button", { name: "Add tags", exact: true })
    .click()
  await page
    .getByPlaceholder("Find or add a tag")
    .fill("Favorites")
  await page
    .getByPlaceholder("Find or add a tag")
    .press("Enter")
  await page.keyboard.press("Escape")
  const request = page.waitForRequest(
    (req) => req.method() === "POST",
  )
  await page
    .getByRole("button", { name: "Save view", exact: true })
    .click()
  const saved = (await request).postDataJSON()
  expect(saved.tags).toEqual(["Favorites"])
  expect(saved.id).toBe("new-dashboard")
})

test("tabs keep edits and the preview stays beside structured forms while unknown settings survive save", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto("/manage/views/panels?item=view-0")
  await page
    .getByRole("button", {
      name: "Entity labels",
      exact: true,
    })
    .click()
  await page
    .getByRole("textbox", {
      name: "Display label",
      exact: true,
    })
    .fill("Reading fan")
  await page
    .getByRole("button", {
      name: "Action buttons",
      exact: true,
    })
    .click()
  await page
    .getByRole("textbox", {
      name: "Button name",
      exact: true,
    })
    .fill("Start scene")
  const editor = await page
    .locator(".collection-editor")
    .boundingBox()
  const preview = await page
    .locator(".collection-preview")
    .boundingBox()
  expect(preview?.x).toBeGreaterThan(
    (editor?.x ?? 0) + (editor?.width ?? 0),
  )
  expect(await page.locator("textarea").count()).toBe(0)
  await page
    .getByRole("link", { name: "General", exact: true })
    .click()
  await page
    .getByRole("link", { name: "Panels", exact: true })
    .click()
  await expect(
    page.getByRole("textbox", {
      name: "Display label",
      exact: true,
    }),
  ).toHaveValue("Reading fan")
  const request = page.waitForRequest(
    (req) => req.method() === "PUT",
  )
  await page
    .getByRole("button", { name: "Save view", exact: true })
    .click()
  const settings = (await request).postDataJSON().panels[0]
    .settings
  expect(JSON.parse(settings.aliasesJson)).toEqual({
    "fan.example": "Reading fan",
  })
  expect(JSON.parse(settings.actionButtonsJson)[0]).toEqual(
    {
      name: "Start scene",
      entityId: "script.example",
      action: "turn_on",
      payload: { count: 3, enabled: true },
      extensionHint: "preserve me",
    },
  )
  expect(
    JSON.parse(settings.visibleWhenJson).any,
  ).toHaveLength(2)
})

test("nested visibility rules remain editable, incomplete new rules block saving", async ({
  page,
}) => {
  await page.goto("/manage/views/panels?item=view-0")
  await page
    .getByRole("button", {
      name: "Visibility conditions",
      exact: true,
    })
    .click()
  const conditions = page
    .getByRole("group", {
      name: "Visibility conditions",
      exact: true,
    })
    .first()
  await conditions
    .getByRole("textbox", { name: "State is", exact: true })
    .first()
    .fill("off, idle")
  await conditions
    .getByRole("button", {
      name: "+ Add condition",
      exact: true,
    })
    .last()
    .click()
  await page
    .getByRole("button", { name: "Save view", exact: true })
    .click()
  await expect(page.getByRole("alert")).toContainText(
    "Complete the required fields",
  )
  await conditions
    .getByRole("textbox", {
      name: "Entity ID",
      exact: true,
    })
    .last()
    .fill("sensor.third")
  const request = page.waitForRequest(
    (req) => req.method() === "PUT",
  )
  await page
    .getByRole("button", { name: "Save view", exact: true })
    .click()
  const condition = JSON.parse(
    (await request).postDataJSON().panels[0].settings
      .visibleWhenJson,
  )
  expect(condition.all[0].any[0].state).toEqual([
    "off",
    "idle",
  ])
  expect(JSON.stringify(condition)).toContain(
    "sensor.third",
  )
})

test("screen view lists are searchable and the editor fits a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(
    "/manage/screens/views?item=browser-screen",
  )
  await page
    .getByRole("button", {
      name: "2 selected",
      exact: true,
    })
    .click()
  await page
    .getByPlaceholder("Search allowed views")
    .fill("Sample view 60")
  await page
    .getByRole("option", {
      name: "Sample view 60",
      exact: true,
    })
    .click()
  await page.keyboard.press("Escape")
  await expect(
    page.getByRole("button", {
      name: "3 selected",
      exact: true,
    }),
  ).toBeVisible()
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        window.innerWidth,
    ),
  ).toBe(true)
  await page
    .getByRole("link", { name: "General", exact: true })
    .click()
  await expect(
    page.getByRole("textbox", {
      name: "Screen name",
      exact: true,
    }),
  ).toHaveValue("Browser dashboard")
})

test("duplicate mapping names block save and reveal the affected settings tab", async ({
  page,
}) => {
  await page.goto("/manage/views/panels?item=view-0")
  await page
    .getByRole("button", {
      name: "Entity labels",
      exact: true,
    })
    .click()
  const labels = page
    .getByRole("group", {
      name: "Entity labels",
      exact: true,
    })
    .first()
  await labels
    .getByRole("button", { name: "Add entry", exact: true })
    .click()
  await labels
    .getByRole("textbox", {
      name: "Entity ID",
      exact: true,
    })
    .last()
    .fill("fan.example")
  await page
    .getByRole("link", { name: "General", exact: true })
    .click()
  await page
    .getByRole("button", { name: "Save view", exact: true })
    .click()
  await expect(page).toHaveURL(/\/views\/panels\?/)
  await expect(
    labels
      .getByRole("textbox", {
        name: "Entity ID",
        exact: true,
      })
      .first(),
  ).toBeFocused()
  await labels
    .getByRole("textbox", {
      name: "Entity ID",
      exact: true,
    })
    .last()
    .fill("fan.second")
  await labels
    .getByRole("textbox", {
      name: "Display label",
      exact: true,
    })
    .last()
    .fill("Second fan")
  const request = page.waitForRequest(
    (req) => req.method() === "PUT",
  )
  await page
    .getByRole("button", { name: "Save view", exact: true })
    .click()
  expect(
    JSON.parse(
      (await request).postDataJSON().panels[0].settings
        .aliasesJson,
    ),
  ).toEqual({
    "fan.example": "Ceiling fan",
    "fan.second": "Second fan",
  })
})
