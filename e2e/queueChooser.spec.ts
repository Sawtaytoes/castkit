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
    const panel = await chooser.boundingBox()
    if (!panel) throw new Error("Missing chooser bounds")
    await Promise.all(
      (await chooser.getByRole("button").all()).map(
        async (button) => {
          const bounds = await button.boundingBox()
          if (!bounds)
            throw new Error("Missing control bounds")
          expect(
            bounds.y + bounds.height,
          ).toBeLessThanOrEqual(panel.y + panel.height + 1)
          expect(
            bounds.x + bounds.width,
          ).toBeLessThanOrEqual(panel.x + panel.width + 1)
          expect(bounds.height).toBeGreaterThanOrEqual(44)
        },
      ),
    )
    if (size === "square") {
      await expect(choices).toHaveCount(2)
      expect(
        await choices
          .first()
          .evaluate(
            (element) => getComputedStyle(element).fontSize,
          ),
      ).toBe("34px")
      const multiplePeople = {
        ...data,
        revision: "more-people",
        people: data.people.concat([
          {
            id: "linus",
            name: "Linus",
            artworkPath: "/__test__/avatar/missing",
          },
          {
            id: "sven",
            name: "Sven",
            artworkPath: "/__test__/avatar/missing",
          },
        ]),
      }
      expect(
        (
          await request.post("/__test__/mqtt", {
            data: {
              topic: "castkit/channels/queues/fixture/set",
              payload: multiplePeople,
            },
          })
        ).ok(),
      ).toBe(true)
      const people = chooser.getByRole("group", {
        name: "Selected people",
      })
      await expect(
        people.getByRole("button", { name: "Remove Sven" }),
      ).toHaveCount(1)
      const geometry = await people.evaluate((element) => {
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
        "scroll:queue-people:sample:more-people",
      )
      await people.evaluate((element) => {
        element.scrollTop = element.scrollHeight
      })
      await expect(
        people.getByRole("button", { name: "Remove Sven" }),
      ).toBeInViewport()
      await expect(choices).toHaveCount(2)
    }
    await chooser
      .getByRole("button", { name: "Next queues" })
      .click()
    await expect(
      chooser.getByRole("button", {
        name: "Movies 1",
        exact: true,
      }),
    ).toHaveCount(0)
    await choices.first().click()
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
