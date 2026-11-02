import { expect, test } from "@playwright/test"
import { idleActivityFixture } from "../packages/slatecast/src/platform/__fixtures__/idleActivity.ts"

test("an idle combined Activity view keeps complete point cards over the real display socket", async ({
  page,
  request,
}) => {
  const snapshot = idleActivityFixture()
  expect(
    (
      await request.post("/api/access/login", {
        data: { pin: "2468" },
      })
    ).ok(),
  ).toBe(true)
  const feeds = [
    {
      id: "fit/usage",
      type: "ai-usage.v1",
      data: snapshot.channels.usage?.data,
    },
    {
      id: "fit/points",
      type: "kids-points.v1",
      data: snapshot.channels.points?.data,
    },
    {
      id: "fit/printers",
      type: "printers.v1",
      data: { printers: [] },
    },
    {
      id: "fit/discs",
      type: "rip-deck.v1",
      data: {
        bays: [],
        alerts: [],
        isPresent: false,
        activeCount: 0,
        loadedDiscCount: 0,
      },
    },
    {
      id: "fit/music",
      type: "music-player.v1",
      data: { players: [], isAutomaticSelection: false },
    },
  ]
  await Promise.all(
    feeds.map(async (feed) => {
      expect(
        (
          await request.post(
            "/api/manage/platform/channels",
            {
              data: {
                id: feed.id,
                name: feed.id,
                sourceId: "events",
                type: feed.type,
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
              topic: `castkit/channels/${feed.id}/set`,
              payload: feed.data,
            },
          })
        ).ok(),
      ).toBe(true)
    }),
  )
  const view = {
    ...snapshot.view,
    id: "idle-points-fit",
    name: "Idle Activity fit",
    panels: snapshot.view.panels.map((panel) => ({
      ...panel,
      bindings: { data: `fit/${panel.id}` },
    })),
  }
  expect(
    (
      await request.post("/api/manage/platform/views", {
        data: view,
      })
    ).ok(),
  ).toBe(true)
  await page.setViewportSize({ width: 1778, height: 600 })
  await page.goto("/view/idle-points-fit")
  await expect(
    page.locator(".kids-points-card"),
  ).toHaveCount(3)
  await expect(page.locator(".platform-panel")).toHaveCount(
    2,
  )
  const clipping = await page
    .locator(".kids-points-card")
    .evaluateAll((cards) =>
      cards.flatMap((card) => {
        const bounds = card.getBoundingClientRect()
        return Array.from(
          card.querySelectorAll(
            "h3,.kids-points-total,.kids-points-bar,.kids-points-footnote",
          ),
        ).flatMap((part) => {
          const rect = part.getBoundingClientRect()
          return rect.top < bounds.top ||
            rect.bottom > bounds.bottom + 1
            ? [part.className || part.tagName]
            : []
        })
      }),
    )
  expect(clipping).toEqual([])
})
