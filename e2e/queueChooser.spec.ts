import { execFileSync } from "node:child_process"
import { expect, test } from "@playwright/test"

// The normal projects verify the responsive page; the square case exercises
// the exact streamed-panel geometry rather than inferring fit from a desktop.
const sizes = ["window", "square"] as const
sizes.forEach((size) => {
  test(`queue choices remain large, complete, and actionable in the ${size} layout`, async ({
    page,
    request,
  }) => {
    if (size === "square") {
      await page.setViewportSize({
        width: 480,
        height: 480,
      })
    }
    const data = {
      sessionId: "sample",
      revision: "sample",
      isActive: true,
      expiresAt: Date.now() + 300_000,
      people: [
        {
          id: "ada",
          name: "Ada",
          artworkPath: "/__test__/avatar/ada",
        },
        {
          id: "grace",
          name: "Grace",
          artworkPath: "/__test__/avatar/grace",
        },
      ],
      queues: Array.from({ length: 30 }, (_, index) => ({
        id: `queue-${index}`,
        title: `Movies ${index + 1}`,
        artworkPath:
          index % 2 === 0
            ? "/__test__/queue-poster.svg"
            : undefined,
      })),
    }
    expect(
      (
        await request.post("/__test__/mqtt", {
          data: {
            topic: "castkit/channels/queues/fixture/set",
            payload: data,
          },
        })
      ).ok(),
    ).toBe(true)
    await page.goto("/d/e2e-preview")
    expect(
      (
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
      ).ok(),
    ).toBe(true)
    const chooser = page.getByRole("region", {
      name: "Queue chooser",
    })
    await expect(chooser).toBeVisible()
    await expect
      .poll(() =>
        chooser
          .locator(".queue-picker-avatar img")
          .evaluateAll(
            (images) =>
              images.length === 2 &&
              images.every(
                (image) =>
                  image instanceof HTMLImageElement &&
                  image.complete &&
                  image.naturalWidth > 0,
              ),
          ),
      )
      .toBe(true)
    const choices = chooser.locator(
      ".queue-picker-list > button",
    )
    await expect(choices.first()).toBeVisible()
    await expect
      .poll(() =>
        choices
          .first()
          .locator("img")
          .evaluate(
            (image) =>
              (image as HTMLImageElement).naturalWidth,
          ),
      )
      .toBeGreaterThan(0)
    const tileBounds = await choices.first().boundingBox()
    if (!tileBounds) throw new Error("Missing tile")
    expect(
      Math.abs(tileBounds.width - tileBounds.height),
    ).toBeLessThan(1)
    const panel = await chooser.boundingBox()
    if (!panel) throw new Error("Missing chooser bounds")
    await expect(
      chooser.getByText("Choose a queue"),
    ).toHaveCount(0)
    await expect(
      chooser.locator("header .queue-picker-person-name"),
    ).toHaveCount(0)
    const list = chooser.getByRole("group", {
      name: "Queues",
    })
    await expect(list).toHaveAttribute(
      "data-castkit-scroll",
      "true",
    )
    await expect(choices).toHaveCount(30)
    const boxes = await choices.evaluateAll((elements) =>
      elements.map((element) => {
        const bounds = element.getBoundingClientRect()
        return {
          top: bounds.top,
          bottom: bounds.bottom,
          left: bounds.left,
          right: bounds.right,
        }
      }),
    )
    for (let index = 1; index < boxes.length; index++) {
      const current = boxes[index]!
      const previous = boxes[index - 1]!
      expect(
        current.left >= previous.right - 1 ||
          current.top >= previous.bottom - 1,
      ).toBe(true)
    }
    if (size === "square") {
      const fullRows = await list.evaluate((element) => {
        const bounds = element.getBoundingClientRect()
        return [
          ...element.querySelectorAll("button"),
        ].filter((button) => {
          const row = button.getBoundingClientRect()
          return (
            row.top >= bounds.top &&
            row.bottom <= bounds.bottom + 1
          )
        }).length
      })
      expect(fullRows).toBeGreaterThanOrEqual(6)
      const geometry = await list.evaluate((element) => {
        const bounds = element.getBoundingClientRect()
        return {
          identity: element.getAttribute(
            "data-castkit-target",
          ),
          top: bounds.top,
          left: bounds.left,
          width: element.clientWidth,
          height: element.clientHeight,
          scrollHeight: element.scrollHeight,
          scrollTop: element.scrollTop,
        }
      })
      const plan = JSON.parse(
        execFileSync(
          "python3",
          [
            "e2e/__fixtures__/native_scroll_geometry.py",
            JSON.stringify(geometry),
          ],
          { encoding: "utf8" },
        ),
      )
      expect(plan.bottom - plan.top).toBeGreaterThanOrEqual(
        64,
      )
      expect(plan.key[0]).toBe(
        "scroll:queues:sample:sample",
      )
      await page.screenshot({
        path: "docs/images/queue-picker-density/after.png",
      })
    }
    await list.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await expect(choices.last()).toBeInViewport()
    await choices.last().click()

    await expect
      .poll(async () => {
        const response = await request.get(
          "/__test__/published",
        )
        return (await response.json()).some(
          (entry: { topic: string; payload: string }) =>
            entry.topic ===
              "castkit/queues/fixture/command" &&
            JSON.parse(entry.payload).action === "choose",
        )
      })
      .toBe(true)
    await test.info().attach(`queue-chooser-${size}`, {
      body: await page.screenshot(),
      contentType: "image/png",
    })
  })
})
