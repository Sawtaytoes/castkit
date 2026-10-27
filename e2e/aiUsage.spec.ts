import { expect, test } from "@playwright/test"

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
  await page.goto("/view/usage")
  const trigger = page.getByRole("button", {
    name: "Show Claude usage details",
  })
  await expect(trigger).toBeVisible()
  await expect(page.getByText("Weekly Fable")).toBeHidden()
  await page.screenshot({
    path: `__screenshots__/usage-overview-${testInfo.project.name}.png`,
  })
  await trigger.click()
  const dialog = page.getByRole("dialog", {
    name: "Claude usage details",
  })
  await expect(
    dialog.getByText("Weekly (all models)"),
  ).toBeVisible()
  await expect(
    dialog.getByText("5-hour limit"),
  ).toBeVisible()
  await expect(
    dialog.getByText("Weekly Fable"),
  ).toBeVisible()
  await expect(
    dialog.getByText("88%", { exact: true }),
  ).toBeVisible()
  await expect(dialog.getByText(/^Resets /)).toHaveCount(3)
  const bounds = await dialog.boundingBox()
  const viewport = page.viewportSize()
  if (!bounds || !viewport) {
    throw new Error(
      "The open usage dialog must have visible bounds",
    )
  }
  expect(bounds.width).toBeLessThanOrEqual(viewport.width)
  expect(bounds.height).toBeLessThanOrEqual(viewport.height)
  await page.screenshot({
    path: `__screenshots__/usage-details-${testInfo.project.name}.png`,
  })
  await dialog
    .getByRole("button", { name: "Close usage details" })
    .click()
  await expect(trigger).toBeFocused()
  await trigger.press("Enter")
  await expect(dialog).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()
  await page
    .getByRole("button", {
      name: "Show Codex 1 usage details",
    })
    .click()
  const codex = page.getByRole("dialog", {
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
