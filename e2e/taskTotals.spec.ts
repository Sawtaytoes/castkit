import { expect, test } from "@playwright/test"

test("task totals drill into only their scans and refresh from the real socket", async ({
  page,
  request,
}) => {
  const now = Date.now()
  const tasks = [
    {
      id: "piano-first",
      name: "Piano",
      atMs: now - 60000,
      points: 100,
      minutes: 15,
    },
    {
      id: "piano-second",
      name: "Piano",
      atMs: now,
      points: 0,
      minutes: 7,
    },
    {
      id: "reading",
      name: "Reading",
      atMs: now,
      points: 50,
      minutes: 10,
    },
  ]
  const publish = (entries: typeof tasks) =>
    request.post("/__test__/mqtt", {
      data: {
        topic: "castkit/channels/points/task-totals/set",
        payload: {
          kids: [
            {
              id: "robin",
              name: "Robin",
              pointsToday: 150,
              day: new Date(now).toISOString().slice(0, 10),
              timeZone: "UTC",
              tasksToday: entries,
            },
          ],
        },
      },
    })
  expect((await publish(tasks)).ok()).toBe(true)
  const snapshot = await request.get(
    "/api/display/view/task-totals",
  )
  expect(snapshot.ok()).toBe(true)
  expect(
    (await snapshot.json()).channels["points/task-totals"]
      .data.kids[0].tasksToday,
  ).toHaveLength(3)
  await page.goto("/view/task-totals")
  await page
    .getByRole("button", {
      name: "View Robin's tasks today",
    })
    .click()
  await expect(
    page.getByText("22 min total · 2 scans"),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "View Piano scans" }),
  ).toHaveCount(1)
  await page
    .getByRole("button", { name: "View Piano scans" })
    .click()
  const scans = page.getByRole("region", {
    name: "Scroll Piano scans",
  })
  await expect(scans.locator("time")).toHaveCount(2)
  await expect(
    scans.locator("[data-task-id='reading']"),
  ).toHaveCount(0)
  await expect(
    scans.locator("[data-task-id]").first(),
  ).toHaveAttribute("data-task-id", "piano-second")
  await publish(
    tasks.filter((task) => task.id !== "piano-first"),
  )
  await expect(
    page.getByText("7 min total · 1 scan"),
  ).toBeVisible()
  await expect(scans.locator("time")).toHaveCount(1)
  await page
    .getByRole("button", { name: "Back to today's tasks" })
    .click()
  await expect(
    page.getByRole("button", {
      name: "View Reading scans",
    }),
  ).toBeVisible()
  await page
    .getByRole("button", { name: "Back to all children" })
    .click()
  await expect(
    page.getByRole("button", {
      name: "View Robin's tasks today",
    }),
  ).toBeVisible()
})
