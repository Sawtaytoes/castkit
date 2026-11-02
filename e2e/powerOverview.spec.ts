import { expect, test } from "@playwright/test"
import { powerOverviewFixture } from "../packages/slatecast/src/platform/__fixtures__/powerOverview.ts"

test("a saved power overview keeps all values and visible trends over the real display socket", async ({
  page,
  request,
}) => {
  const snapshot = powerOverviewFixture({
    isCompactHistory: true,
  })
  expect(
    (
      await request.post("/api/access/login", {
        data: { pin: "2468" },
      })
    ).ok(),
  ).toBe(true)
  await Promise.all(
    Object.values(snapshot.channels).map(
      async (channel) => {
        expect(
          (
            await request.post(
              "/api/manage/platform/channels",
              {
                data: {
                  id: channel.id,
                  name: channel.id,
                  sourceId: "events",
                  type: channel.type,
                  settings: {},
                },
              },
            )
          ).ok(),
        ).toBe(true)
        expect(
          (
            await request.post("/__test__/mqtt", {
              data: {
                topic: `castkit/channels/${channel.id}/set`,
                payload: channel.data,
              },
            })
          ).ok(),
        ).toBe(true)
      },
    ),
  )
  expect(
    (
      await request.post("/api/manage/platform/views", {
        data: snapshot.view,
      })
    ).ok(),
  ).toBe(true)
  await page.setViewportSize({ width: 2000, height: 668 })
  await page.goto("/view/power-overview")
  await expect(page.locator(".home-group")).toHaveCount(5)
  await expect(
    page.locator(".platform-entity-value"),
  ).toHaveCount(33)
  await expect(
    page.locator(".home-chart-preview svg"),
  ).toHaveCount(29)
  await expect(
    page.locator(".home-chart-preview svg text"),
  ).toHaveCount(0)
  await page.evaluate(() => document.fonts.ready)
  const fit = await page
    .locator(".platform-layout")
    .evaluate((viewport) => ({
      width: viewport.clientWidth,
      scrollWidth: viewport.scrollWidth,
      height: viewport.clientHeight,
      scrollHeight: viewport.scrollHeight,
      overlaps: Array.from(
        viewport.querySelectorAll(".platform-entity-value"),
      ).flatMap((value) => {
        const chart = value.parentElement?.querySelector(
          ".home-chart-preview",
        )
        return chart &&
          chart.getBoundingClientRect().top <
            value.getBoundingClientRect().bottom
          ? [value.textContent]
          : []
      }),
    }))
  expect(fit.scrollWidth).toBeLessThanOrEqual(fit.width + 1)
  expect(fit.scrollHeight).toBeLessThanOrEqual(
    fit.height + 1,
  )
  expect(fit.overlaps).toEqual([])
  const history = page
    .locator(".home-chart-details")
    .first()
  await history.locator("summary").focus()
  await history.locator("summary").press("Enter")
  await expect(history).toHaveAttribute("open", "")
  await expect(
    page.locator(".home-chart-preview svg"),
  ).toHaveCount(29)
  await history.locator("summary").press("Enter")
  await expect(history).not.toHaveAttribute("open", "")
})
