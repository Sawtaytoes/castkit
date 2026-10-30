import { expect, test } from "@playwright/test"

;[0, 2, 3, 4].forEach((count) => {
  test(`${count} queue posters use the measured square panel`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 480, height: 480 })
    await request.post("/__test__/mqtt", {
      data: {
        topic: "castkit/channels/queues/fixture/set",
        payload: {
          sessionId: "poster-fit",
          revision: `poster-fit-${count}`,
          isActive: true,
          expiresAt: Date.now() + 300_000,
          people: [
            {
              id: "ada",
              name: "Ada",
              artworkPath: "/__test__/avatar/ada",
            },
          ],
          queues: Array.from(
            { length: count },
            (_unused, index) => ({
              id: `sample-${index}`,
              title: [
                "Educational Shows",
                "Younger Kids Movies",
                "Short Films",
                "Holiday Movies",
              ][index],
              artworkPath: "/__test__/queue-poster.svg",
            }),
          ),
        },
      },
    })
    await page.goto("/d/e2e-preview")
    await request.post("/__test__/mqtt", {
      data: {
        topic: "castkit/e2e-preview/override/set",
        payload: {
          viewId: "queue-chooser",
          durationSeconds: 300,
          priority: 90,
        },
      },
    })
    const chooser = page.getByRole("region", {
      name: "Queue chooser",
    })
    await expect(chooser).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    const list = chooser.getByRole("group", {
      name: "Queues",
    })
    await expect
      .poll(() =>
        list.evaluate(
          (element) =>
            element.scrollHeight - element.clientHeight,
        ),
      )
      .toBeLessThanOrEqual(1)
    if (count) {
      await expect
        .poll(() =>
          chooser
            .locator(".queue-picker-poster")
            .evaluateAll((images) =>
              images.every(
                (image) =>
                  image instanceof HTMLImageElement &&
                  image.complete &&
                  image.naturalWidth > 0,
              ),
            ),
        )
        .toBe(true)
      const tiles = chooser.locator(
        ".queue-picker-list > button",
      )
      await expect(tiles).toHaveCount(count)
      const bounds = await list.boundingBox()
      if (!bounds) throw new Error("Missing list")
      const boxes = await tiles.evaluateAll((elements) =>
        elements.map((element) => {
          const box = element.getBoundingClientRect()
          return {
            top: box.top,
            bottom: box.bottom,
            width: box.width,
            height: box.height,
          }
        }),
      )
      boxes.forEach((box) => {
        expect(box.top).toBeGreaterThanOrEqual(bounds.y)
        expect(box.bottom).toBeLessThanOrEqual(
          bounds.y + bounds.height + 1,
        )
        expect(box.width).toBeGreaterThan(110)
        expect(box.height).toBeGreaterThan(160)
      })
      if (count === 4)
        expect(boxes[0]?.width).toBeGreaterThan(180)
      if (count === 2)
        expect(boxes[0]?.height).toBeGreaterThan(300)
    } else {
      const message = list.getByText(
        "No matching queues.",
        { exact: true },
      )
      await expect(message).toBeVisible()
      const offset = await message.evaluate((element) => {
        const text = element.getBoundingClientRect(),
          parent =
            element.parentElement?.getBoundingClientRect()
        if (!parent)
          throw new Error("Missing empty-state container")
        return Math.abs(
          (text.top +
            text.bottom -
            parent.top -
            parent.bottom) /
            2,
        )
      })
      expect(offset).toBeLessThan(2)
    }
    await page.screenshot({
      path: `__screenshots__/chooser-posters-fit/${count}.png`,
    })
  })
})
