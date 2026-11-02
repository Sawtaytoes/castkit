import { expect, test } from "@playwright/test"

test("a scoped phone link changes static pages, rejects stale commands, and ends its session", async ({
  page,
  request,
  browser,
}, testInfo) => {
  const session = await (
    await request.post("/__test__/cooking")
  ).json()
  const stranger = await browser.newContext()
  const denied = await stranger.request.get(
    `/api/cooking/${session.id}/state`,
  )
  expect(denied.status()).toBe(401)
  await stranger.close()
  await page.goto(`/cook/${session.id}#${session.key}`)
  await expect(
    page.getByRole("heading", {
      name: "Lemon chickpea skillet",
    }),
  ).toBeVisible()
  await expect(
    page.getByRole("heading", {
      name: "Ingredients",
      exact: true,
    }),
  ).toBeVisible()
  if (testInfo.project.name === "chromium-narrow")
    await page.screenshot({
      path: "__screenshots__/recipe-phone-after.png",
      fullPage: true,
    })
  expect(page.url()).not.toContain(session.key)
  await page
    .getByRole("button", { name: "Next", exact: true })
    .click()
  await expect(
    page.getByRole("heading", {
      name: "Step 1 of 2",
      exact: true,
    }),
  ).toBeVisible()
  const stale = await request.post(
    `/api/cooking/${session.id}/command`,
    {
      headers: { "x-castkit-cooking-key": session.key },
      data: { action: "next", revision: 0 },
    },
  )
  expect(stale.status()).toBe(409)
  await page
    .getByRole("button", {
      name: "Ingredients",
      exact: true,
    })
    .click()
  await page
    .getByRole("button", {
      name: "Instructions",
      exact: true,
    })
    .click()
  await expect(
    page.getByRole("heading", {
      name: "Step 1 of 2",
      exact: true,
    }),
  ).toBeVisible()
  await page.reload()
  await expect(
    page.getByRole("heading", {
      name: "Step 1 of 2",
      exact: true,
    }),
  ).toBeVisible()
  await page
    .getByRole("button", { name: "Done cooking" })
    .click()
  await expect(
    page.getByText("Cooking finished.", { exact: false }),
  ).toBeVisible()
  expect(
    (
      await request.get(
        `/api/cooking/${session.id}/state`,
        {
          headers: { "x-castkit-cooking-key": session.key },
        },
      )
    ).status(),
  ).toBe(401)
})

test("a full 800 × 480 platform page fits the ePaper canvas and changes only on command", async ({
  page,
  request,
}, testInfo) => {
  const session = await (
    await request.post("/__test__/cooking")
  ).json()
  const login = await page.request.post(
    "/api/access/login",
    { data: { pin: "2468" } },
  )
  expect(login.ok()).toBe(true)
  await page.setViewportSize({ width: 800, height: 480 })
  await page.goto(
    `/view/${session.targetId}?device=e2e-eink&capture=1`,
  )
  await expect(page.getByLabel("Recipe page")).toBeVisible()
  await expect(
    page.locator("[data-castkit-ready]"),
  ).toBeVisible()
  const fit = await page
    .getByLabel("Recipe page")
    .evaluate((element) => ({
      width: element.getBoundingClientRect().width,
      height: element.getBoundingClientRect().height,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
    }))
  expect(fit.width).toBe(800)
  expect(fit.height).toBe(480)
  expect(fit.scrollHeight).toBeLessThanOrEqual(
    fit.clientHeight,
  )
  await expect(
    page.getByText("Page 1 / 3", { exact: true }),
  ).toBeVisible()
  if (testInfo.project.name === "chromium-wide")
    await page.screenshot({
      path: "__screenshots__/recipe-panel-after.png",
    })
  const before = await request.get(
    `/api/cooking/${session.id}/state`,
    { headers: { "x-castkit-cooking-key": session.key } },
  )
  expect((await before.json()).revision).toBe(0)
  await request.post(`/api/cooking/${session.id}/command`, {
    headers: { "x-castkit-cooking-key": session.key },
    data: { action: "next", revision: 0 },
  })
  const after = await request.get(
    `/api/cooking/${session.id}/state`,
    { headers: { "x-castkit-cooking-key": session.key } },
  )
  const state = await after.json()
  await page.goto(
    `/view/${state.targetId}?device=e2e-eink&capture=1`,
  )
  await expect(
    page.getByText("Step 1 of 2", { exact: true }),
  ).toBeVisible()
  await request.post(`/api/cooking/${session.id}/command`, {
    headers: { "x-castkit-cooking-key": session.key },
    data: { action: "done", revision: state.revision },
  })
})

test("Recipes starts a phone-only session through the Mealie source without assigning hardware", async ({
  page,
  request,
  baseURL,
}) => {
  await page.request.post("/api/access/login", {
    data: { pin: "2468" },
  })
  const before = await (
    await page.request.get("/api/manage/platform")
  ).json()
  const source = await page.request.post(
    "/api/manage/platform/sources",
    {
      data: {
        id: "mealie-e2e",
        name: "Test recipes",
        adapter: "mealie",
        isEnabled: true,
        settings: { url: `${baseURL}/__test__/mealie` },
        secrets: { apiToken: "fixture-token" },
      },
    },
  )
  expect(source.ok()).toBe(true)
  await page.goto("/manage/recipes")
  await page
    .getByLabel("Or paste a recipe link")
    .fill("lemon-chickpea-skillet")
  await page
    .getByRole("button", {
      name: "Show recipe",
      exact: true,
    })
    .click()
  await expect(
    page.getByRole("heading", {
      name: "Lemon chickpea skillet",
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    page.getByRole("heading", {
      name: "Phone only",
      exact: true,
    }),
  ).toBeVisible()
  await page
    .getByText("800 × 480 display preview", { exact: true })
    .click()
  await expect(
    page
      .frameLocator(
        'iframe[title="Recipe display preview"]',
      )
      .getByLabel("Recipe page"),
  ).toBeVisible()
  const current = await (
    await page.request.get("/api/manage/cooking")
  ).json()
  expect(
    current.sessions.find(
      (session: { sourceId: string }) =>
        session.sourceId === "mealie-e2e",
    ).deviceId,
  ).toMatch(/^phone-only\//)
  const after = await (
    await page.request.get("/api/manage/platform")
  ).json()
  expect(after.deviceScreens).toEqual(before.deviceScreens)
  await page
    .getByRole("button", {
      name: "Done cooking",
      exact: true,
    })
    .click()
  await expect(
    page.getByRole("heading", {
      name: "Lemon chickpea skillet",
      exact: true,
    }),
  ).not.toBeVisible()
  await page.request.delete(
    "/api/manage/platform/sources/mealie-e2e",
  )
})
