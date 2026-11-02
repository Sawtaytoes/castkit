import { expect, test } from "@playwright/test"

test("room timer priority, controls, and promotion use the real socket", async ({
  page,
  request,
}, testInfo) => {
  const now = Date.now()
  const entities = [600, 300, 450].map((seconds) => ({
    id: `timer.${seconds}.r1`,
    name: `Tea ${seconds} · Lounge`,
    domain: "timer",
    state: "active",
    attributes: {
      room: "lounge",
      finishes_at: new Date(
        now + seconds * 1000,
      ).toISOString(),
    },
    actions: ["pause", "cancel", "add_5_minutes"],
  }))
  const publish = async (items: typeof entities) =>
    request.post("/__test__/mqtt", {
      data: {
        topic: "castkit/channels/timers/fixture/set",
        payload: { entities: items },
      },
    })
  await publish(entities)
  await page.goto("/view/timers-legacy")
  await expect(
    page.getByText("Tea 300 · Lounge", { exact: true }),
  ).toBeVisible()
  await page.screenshot({
    path: `docs/images/timer-extension-legacy-${testInfo.project.name}.png`,
  })
  await page.goto("/view/timers-priority")
  await expect(
    page.locator(".timer-priority-card").first(),
  ).toContainText("Tea 300")
  await expect(
    page.locator(".timer-priority-card"),
  ).toHaveCount(3)
  await page.screenshot({
    path: `docs/images/timer-extension-after-${testInfo.project.name}.png`,
  })
  await page
    .getByRole("button", {
      name: "Add 5 minutes",
      exact: true,
    })
    .first()
    .click()
  await expect
    .poll(async () =>
      (
        await (
          await request.get("/__test__/published")
        ).json()
      ).some(
        (item: { topic: string; payload: string }) =>
          item.topic === "fixture/timers/command" &&
          JSON.parse(item.payload).action ===
            "add_5_minutes" &&
          JSON.parse(item.payload).entityId ===
            "timer.300.r1",
      ),
    )
    .toBe(true)
  await page
    .getByRole("button", { name: "Pause", exact: true })
    .first()
    .click()
  await expect
    .poll(async () =>
      (
        await (
          await request.get("/__test__/published")
        ).json()
      ).some(
        (item: { topic: string; payload: string }) =>
          item.topic === "fixture/timers/command" &&
          JSON.parse(item.payload).action === "pause" &&
          JSON.parse(item.payload).entityId ===
            "timer.300.r1",
      ),
    )
    .toBe(true)
  await page
    .getByRole("button", { name: "Cancel", exact: true })
    .first()
    .click()
  await publish(
    entities.filter(
      (entity) => entity.id !== "timer.300.r1",
    ),
  )
  await expect(
    page.locator(".timer-priority-card").first(),
  ).toContainText("Tea 450")
})
