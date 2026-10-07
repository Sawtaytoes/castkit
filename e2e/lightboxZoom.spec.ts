import { expect, test } from "@playwright/test"

test("enlarged print images support real two-finger pinch, pan, reset, and close without sending commands", async ({
  page,
  request,
}) => {
  await page.route(
    "**/api/display/view/zoom-lab/media/**",
    (route) =>
      route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#222"/><text x="300" y="300" fill="white" font-size="20">Layer 24 / 78</text></svg>',
      }),
  )
  await request.post("/__test__/mqtt", {
    data: {
      topic: "castkit/channels/printers/zoom/set",
      payload: {
        printers: [
          {
            id: "printer-a",
            name: "Lab printer",
            jobName: "Bracket",
            percent: 42,
            state: "printing",
            thumbnailPath: "/zoom-fixture.svg",
          },
        ],
      },
    },
  })
  await page.goto("/view/zoom-lab")
  await expect(
    page.getByRole("button", { name: "Zoom in" }),
  ).toHaveCount(0)
  const image = page.locator(".platform-printer-image")
  const original = await image.elementHandle()
  const writes = new Set<string>()
  page.on("request", (request) => {
    if (request.method() === "POST")
      writes.add(request.url())
  })
  await page
    .getByRole("button", {
      name: "Enlarge Lab printer print image",
    })
    .click()
  const dialog = page.getByRole("dialog", {
    name: "Lab printer print image",
  })
  const surface = dialog.locator(".zoomable-media-surface")
  const bounds = await surface.boundingBox()
  if (!bounds)
    throw new Error("Enlarged image bounds missing")
  const center = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  }
  const session = await page.context().newCDPSession(page)
  const fingers = (distance: number) => [
    { id: 1, x: center.x - distance, y: center.y },
    { id: 2, x: center.x + distance, y: center.y },
  ]
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: fingers(25),
  })
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: fingers(75),
  })
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  })
  // Chromium rounds touch coordinates to device pixels, especially in the phone window.
  await expect
    .poll(async () =>
      Number(
        (
          await dialog
            .getByLabel("Image zoom")
            .textContent()
        )?.replace("%", ""),
      ),
    )
    .toBeGreaterThan(280)
  expect(
    Number(
      (
        await dialog.getByLabel("Image zoom").textContent()
      )?.replace("%", ""),
    ),
  ).toBeLessThan(320)
  const beforePan = await dialog
    .locator(".zoomable-media-content")
    .getAttribute("style")
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ id: 1, ...center }],
  })
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { id: 1, x: center.x + 25, y: center.y + 20 },
    ],
  })
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  })
  await expect
    .poll(() =>
      dialog
        .locator(".zoomable-media-content")
        .getAttribute("style"),
    )
    .not.toBe(beforePan)
  await expect(dialog).toBeVisible()
  await dialog
    .getByRole("button", { name: "Reset zoom" })
    .click()
  await expect(dialog.getByLabel("Image zoom")).toHaveText(
    "100%",
  )
  await dialog
    .getByRole("button", { name: "Zoom in" })
    .click()
  await expect(dialog.getByLabel("Image zoom")).toHaveText(
    "150%",
  )
  expect(
    await image.evaluate(
      (element, previous) => element === previous,
      original,
    ),
  ).toBe(true)
  await dialog
    .getByRole("button", {
      name: "Close Lab printer print image",
    })
    .click()
  await expect(dialog).toHaveCount(0)
  await page
    .getByRole("button", {
      name: "Enlarge Lab printer print image",
    })
    .click()
  await expect(page.getByLabel("Image zoom")).toHaveText(
    "100%",
  )
  await page.keyboard.press("Escape")
  await expect(
    page.getByRole("button", {
      name: "Enlarge Lab printer print image",
    }),
  ).toBeFocused()
  expect(Array.from(writes)).toEqual([])
  await session.detach()
})
