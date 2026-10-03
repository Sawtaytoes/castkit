import { expect, test } from "@playwright/test"

test.describe.configure({ mode: "serial" })

const publishPrinters = async (
  request: import("@playwright/test").APIRequestContext,
) =>
  request.post("/__test__/mqtt", {
    data: {
      topic: "castkit/channels/printers/lab/set",
      payload: {
        printers: [
          {
            id: "printer-a",
            name: "Lab printer",
            jobName: "Bracket",
            percent: 42,
            state: "printing",
            remainingMinutes: 20,
          },
        ],
      },
    },
  })

test("a bookmark combines sources and receives broker updates over the real socket", async ({
  page,
  request,
}) => {
  await publishPrinters(request)
  await page.goto("/view/lab")
  await expect(
    page.getByText("Bracket", { exact: true }),
  ).toBeVisible()
  await expect(
    page.locator("[data-castkit-ready]"),
  ).toBeVisible()
  await request.post("/__test__/mqtt", {
    data: {
      topic: "castkit/channels/printers/lab/set",
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
    page.getByText("Second bracket", { exact: true }),
  ).toBeVisible()
})

test("a private bookmark unlocks on the touch keypad and locks server data again", async ({
  page,
  request,
}) => {
  await publishPrinters(request)
  await page.goto("/view/private-lab")
  await expect(
    page.getByText("Private lab", { exact: true }),
  ).toBeVisible()
  expect(
    (
      await page.request.get(
        "/api/display/view/private-lab",
      )
    ).status(),
  ).toBe(401)
  await page
    .getByRole("button", { name: "1", exact: true })
    .click()
  await page
    .getByRole("button", { name: "3", exact: true })
    .click()
  await page
    .getByRole("button", { name: "5", exact: true })
    .click()
  await page
    .getByRole("button", { name: "7", exact: true })
    .click()
  await page
    .getByRole("button", { name: "Unlock", exact: true })
    .click()
  await expect(
    page.getByText("Bracket", { exact: true }),
  ).toBeVisible()
  await page.reload()
  await expect(
    page.getByText("Bracket", { exact: true }),
  ).toBeVisible()
  await page.request.post("/api/access/lock", {
    data: { kind: "view", id: "private-lab" },
  })
  await expect(
    page.getByRole("button", {
      name: "Unlock",
      exact: true,
    }),
  ).toBeVisible()
  expect(
    (
      await page.request.get(
        "/api/display/view/private-lab",
      )
    ).status(),
  ).toBe(401)
})

test("management uses the PIN session while the root and API reference remain public", async ({
  page,
}) => {
  await page.goto("/")
  await expect(
    page.getByRole("heading", {
      name: "Your data, on any display.",
      exact: true,
    }),
  ).toBeVisible()
  await page.goto("/manage")
  await expect(
    page.getByRole("heading", {
      name: "Sign in to CastKit",
      exact: true,
    }),
  ).toBeVisible()
  await page.getByLabel(/^Management PIN/).fill("2468")
  const loginResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/access/login"),
  )
  await page
    .getByRole("button", { name: "Sign in", exact: true })
    .click()
  expect((await loginResponse).status()).toBe(200)
  await expect(
    page.getByRole("link", {
      name: "Sources",
      exact: true,
    }),
  ).toBeVisible()
  expect(
    (
      await page.request.get("/api/manage/platform")
    ).status(),
  ).toBe(200)
  expect((await page.request.get("/api")).status()).toBe(
    200,
  )
})

test("a temporary view takes over a display's own page and hands it back", async ({
  page,
  request,
}) => {
  await publishPrinters(request)
  await page.goto("/d/e2e-preview")
  await expect(
    page.locator("[data-castkit-ready]"),
  ).toBeVisible()
  await expect(
    page.getByText("Bracket", { exact: true }),
  ).toHaveCount(0)
  await request.post("/__test__/mqtt", {
    data: {
      topic: "castkit/e2e-preview/override/set",
      payload: {
        viewId: "lab",
        durationSeconds: 3,
        priority: 100,
      },
    },
  })
  await expect(
    page.getByText("Bracket", { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText("Bracket", { exact: true }),
  ).toHaveCount(0, { timeout: 10_000 })
  await expect(
    page.locator("[data-castkit-ready]"),
  ).toBeVisible()
})

test("public printer views share one PIN session and explain disabled controls", async ({
  page,
  context,
  request,
}) => {
  await publishPrinters(request)
  await page.goto("/view/lab")
  await expect(
    page.getByRole("button", {
      name: /Sign in|Sign out|Lock/,
    }),
  ).toHaveCount(0)
  await expect(
    page.locator(".platform-header"),
  ).toHaveCount(0)
  await expect(
    page.getByText("Sign in to control", { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole("button", {
      name: "Pause",
      exact: true,
    }),
  ).toBeDisabled()
  await expect(
    page.getByRole("button", { name: "Stop", exact: true }),
  ).toBeDisabled()
  const other = await context.newPage()
  await other.goto("/screen/desktop")
  await expect(
    other.getByRole("button", {
      name: "Pause",
      exact: true,
    }),
  ).toBeDisabled()
  const admin = await context.newPage()
  await admin.goto("/manage/access")
  await admin.getByLabel(/^Management PIN/).fill("0000")
  await admin
    .getByRole("button", { name: "Sign in", exact: true })
    .click()
  await expect(
    admin.getByText("Incorrect PIN", { exact: true }),
  ).toBeVisible()
  await admin.getByLabel(/^Management PIN/).fill("2468")
  await admin
    .getByRole("button", { name: "Sign in", exact: true })
    .click()
  await expect(
    admin.getByRole("button", {
      name: "Sign out",
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    page.getByRole("button", {
      name: "Pause",
      exact: true,
    }),
  ).toBeEnabled()
  await expect(
    other.getByRole("button", {
      name: "Pause",
      exact: true,
    }),
  ).toBeEnabled()
  await page.goto("/view/private-lab")
  await expect(
    page.getByRole("button", {
      name: "Pause",
      exact: true,
    }),
  ).toBeEnabled()
  await page
    .getByRole("button", { name: "Pause", exact: true })
    .click()
  await expect(
    page.getByRole("alertdialog", {
      name: "Confirm printer action",
    }),
  ).toBeVisible()
  await page
    .getByRole("button", { name: "Go back", exact: true })
    .click()
  await admin
    .getByRole("button", { name: "Sign out", exact: true })
    .click()
  await expect(
    other.getByRole("button", {
      name: "Stop",
      exact: true,
    }),
  ).toBeDisabled()
  await expect(
    page.getByRole("button", {
      name: "Unlock",
      exact: true,
    }),
  ).toBeVisible()
  await page.goto("/view/lab")
  await expect(
    page.getByRole("button", {
      name: "Pause",
      exact: true,
    }),
  ).toBeDisabled()
})

test("a scan panel appears in an active-only monitor and disappears without further broker messages", async ({
  page,
  request,
}) => {
  const kids = [
    {
      id: "robin",
      name: "Robin",
      pointsToday: 20,
      goal: 400,
    },
  ]
  const publish = async (payload: unknown) =>
    request.post("/__test__/mqtt", {
      data: {
        topic: "castkit/channels/points/fixture/set",
        payload,
      },
    })
  await publish({ kids })
  await page.goto("/view/scan-monitor")
  await expect(
    page.getByText("Nothing active", { exact: true }),
  ).toBeVisible()
  await publish({
    kids,
    lastScan: {
      kidId: "robin",
      result: "awarded",
      points: 20,
      taskName: "Feed the Cat",
      atMs: Date.now(),
    },
  })
  await expect(
    page.getByRole("heading", {
      name: "Robin",
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    page.getByText("Nothing active", { exact: true }),
  ).toBeVisible({ timeout: 6000 })
  await expect(
    page.getByRole("heading", {
      name: "Robin",
      exact: true,
    }),
  ).toHaveCount(0)
  await page.reload()
  await expect(
    page.getByText("Nothing active", { exact: true }),
  ).toBeVisible()
})
