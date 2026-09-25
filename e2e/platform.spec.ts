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
  await page
    .getByRole("button", { name: "Lock", exact: true })
    .click()
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
      name: "CastKit",
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
