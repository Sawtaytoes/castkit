import { expect, test } from "@playwright/test"

const IMAGE_DEVICE = {
  id: "sample-image",
  label: "Desk display",
  mac: "02:00:00:00:00:01",
  width: 250,
  height: 122,
  colorMode: "monochrome",
  rotation: 180,
}
const BROWSER_DEVICE = {
  id: "e2e-square",
  label: "Wall display",
  mac: "02:00:00:00:00:02",
  width: 720,
  height: 720,
  renderer: "browser",
  color: "full",
  shape: "square",
  hasTouch: true,
  hasMqttBacklight: true,
  rotation: 0,
}
const SETTINGS = {
  photoPeople: "",
  photoQuery: "",
  photoInterval: "15",
  photoRecency: "0",
  photoPeopleMinimum: "0",
  photoQuality: "80",
  photoFormat: "Auto",
  clockTimezone: "UTC",
  clockTimeFormat: "Auto",
  clockDateStyle: "Auto",
  brightness: "100",
  saturation: "100",
  dither: "off",
  rotation: "180",
  margin_top: "0",
  margin_right: "0",
  margin_bottom: "0",
  margin_left: "0",
  photo_crop_top: "0",
  photo_crop_right: "0",
  photo_crop_bottom: "0",
  photo_crop_left: "0",
  updates: "ON",
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/access/session", (route) =>
    route.fulfill({
      json: {
        isAuthenticated: true,
        isSetupRequired: false,
      },
    }),
  )
  await page.route("**/api/manage/platform", (route) =>
    route.fulfill({
      json: {
        deviceScreens: {},
        screens: [],
        sources: [],
        channels: [],
        views: [],
        plugins: [],
        adapters: [],
        viewSpecs: [],
        presets: [],
        channelStates: {},
      },
    }),
  )
  await page.route("**/api/manage/devices", (route) =>
    route.fulfill({
      json: { devices: [IMAGE_DEVICE, BROWSER_DEVICE] },
    }),
  )
  await page.route(
    "**/api/manage/devices/*/settings",
    (route) =>
      route.fulfill({
        json: {
          settings: route
            .request()
            .url()
            .includes("e2e-square")
            ? { backlightLevel: "65" }
            : SETTINGS,
        },
      }),
  )
  await page.route("**/api/devices/*/image?*", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="250" height="122"><rect width="250" height="122" fill="white"/><text x="12" y="60" fill="black">Display output</text></svg>',
    }),
  )
})

test("tabs preserve edits, browser Back restores the category, and only changed settings are saved", async ({
  page,
}) => {
  await page.goto(
    "/manage/devices/photos?device=sample-image",
  )
  await page
    .getByRole("textbox", {
      name: "Photo query",
      exact: true,
    })
    .fill("landscape")
  await page
    .getByRole("link", { name: "Device", exact: true })
    .click()
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Updated display")
  await page.goBack()
  await expect(
    page.getByRole("textbox", {
      name: "Photo query",
      exact: true,
    }),
  ).toHaveValue("landscape")
  await expect(
    page.getByRole("button", {
      name: "Save device & restart",
    }),
  ).toBeDisabled()
  const saved = page.waitForRequest(
    (request) => request.method() === "PUT",
  )
  await page
    .getByRole("button", {
      name: "Save settings",
      exact: true,
    })
    .click()
  expect((await saved).postDataJSON()).toEqual({
    settings: [
      { kind: "photoQuery", payload: "landscape" },
    ],
  })
  await expect(
    page.getByRole("button", {
      name: "Save device & restart",
    }),
  ).toBeEnabled()
  await page
    .getByRole("link", { name: "Device", exact: true })
    .click()
  await expect(
    page.getByRole("textbox", {
      name: "Name",
      exact: true,
    }),
  ).toHaveValue("Updated display")
})

test("failed saves leave edits and restore the save control", async ({
  page,
}) => {
  await page.goto(
    "/manage/devices/photos?device=sample-image",
  )
  await page
    .getByRole("textbox", {
      name: "Photo query",
      exact: true,
    })
    .fill("water")
  await page.route(
    "**/api/manage/devices/sample-image/settings",
    (route) => route.abort(),
  )
  await page
    .getByRole("button", {
      name: "Save settings",
      exact: true,
    })
    .click()
  await expect(
    page.getByRole("button", {
      name: "Save settings",
      exact: true,
    }),
  ).toBeEnabled()
  await expect(
    page.getByRole("textbox", {
      name: "Photo query",
      exact: true,
    }),
  ).toHaveValue("water")
  await expect(
    page.getByRole("status", { name: "Management status" }),
  ).not.toBeEmpty()
})

test("wide screens split the active category without exposing unrelated controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 2048, height: 1000 })
  await page.goto(
    "/manage/devices/device?device=sample-image",
  )
  await expect(
    page.getByRole("heading", {
      name: "Identity",
      exact: true,
    }),
  ).toBeVisible()
  const identity = await page
    .getByRole("region", { name: "Identity", exact: true })
    .boundingBox()
  await expect
    .poll(
      async () =>
        (
          await page
            .getByRole("region", {
              name: "Display",
              exact: true,
            })
            .boundingBox()
        )?.y,
    )
    .toBe(identity?.y)
  await expect(
    page.getByRole("textbox", {
      name: "Photo query",
      exact: true,
    }),
  ).toHaveCount(0)
  expect(
    (
      await page
        .getByRole("spinbutton", {
          name: "Width (px)",
          exact: true,
        })
        .boundingBox()
    )?.width,
  ).toBeLessThan(150)
  await expect(
    page.getByRole("img", {
      name: "Desk display rendered output",
    }),
  ).toBeVisible()
})

test("search and phone layouts keep every setting reachable without page overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(
    "/manage/devices/image?device=sample-image",
  )
  await page
    .getByRole("button", { name: "Devices", exact: true })
    .click()
  await page
    .getByRole("searchbox", { name: "Find a device" })
    .fill("Wall")
  await expect(
    page.getByRole("button", {
      name: /Desk display Image/,
    }),
  ).toHaveCount(0)
  await page
    .getByRole("button", { name: /Wall display Browser/ })
    .click()
  await page
    .getByRole("link", { name: "Views", exact: true })
    .click()
  await expect(
    page.getByRole("checkbox", { name: "Touch enabled" }),
  ).toBeChecked()
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await expect(page.locator("iframe")).toHaveAttribute(
    "src",
    "/d/e2e-square?preview=1",
  )
  await expect(page.locator("iframe")).toHaveAttribute(
    "inert",
    "",
  )
})

test("browser previews get live data without making a panel online or publishing commands", async ({
  page,
  request,
}) => {
  await page.goto("/d/e2e-preview?preview=1")
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const socket = new WebSocket(
        `ws://${location.host}/d/e2e-preview/ws?preview=1`,
      )
      socket.onmessage = () => {
        socket.send(
          JSON.stringify({
            type: "command",
            command: { action: "play_pause" },
          }),
        )
        socket.close()
        resolve()
      }
    })
  })
  await request.post("/__test__/mqtt", {
    data: {
      topic: "castkit/e2e-preview/now_playing/set",
      payload: {
        title: "Preview update",
        artist: "Sample artist",
        isPlaying: true,
      },
    },
  })
  await expect(
    page.getByText("Preview update"),
  ).toBeVisible()
  const published = (await (
    await request.get("/__test__/published")
  ).json()) as { topic: string; payload: string }[]
  expect(
    published.filter(
      ({ topic, payload }) =>
        topic.includes("e2e-preview") &&
        topic.endsWith("/connected") &&
        payload === "ON",
    ),
  ).toEqual([])
  expect(
    published.filter(
      ({ topic }) =>
        topic.includes("e2e-preview") &&
        topic.endsWith("/command"),
    ),
  ).toEqual([])
})

test("Reload devices recovers from a failed initial request", async ({
  page,
}) => {
  await page.route(
    "**/api/manage/devices",
    (route) => route.abort(),
    { times: 1 },
  )
  await page.goto("/manage/devices/device")
  await expect(
    page.getByRole("heading", {
      name: "No device selected",
    }),
  ).toBeVisible()
  await page
    .getByRole("button", { name: "Reload devices" })
    .click()
  await expect(
    page.getByRole("heading", {
      name: "Desk display",
      exact: true,
    }),
  ).toBeVisible()
})

test("a renderer change still lets pending image settings save before the restart", async ({
  page,
}) => {
  await page.goto(
    "/manage/devices/photos?device=sample-image",
  )
  await page
    .getByRole("textbox", {
      name: "Photo query",
      exact: true,
    })
    .fill("trees")
  await page
    .getByRole("link", { name: "Device", exact: true })
    .click()
  await page
    .getByRole("button", {
      name: "Renderer: Image",
      exact: true,
    })
    .click()
  await page
    .getByRole("option", { name: "Browser", exact: true })
    .click()
  await expect(
    page.getByRole("button", {
      name: "Save settings",
      exact: true,
    }),
  ).toBeEnabled()
  await expect(
    page.getByRole("button", {
      name: "Save device & restart",
    }),
  ).toBeDisabled()
  await page
    .getByRole("button", {
      name: "Save settings",
      exact: true,
    })
    .click()
  await expect(
    page.getByRole("button", {
      name: "Save device & restart",
    }),
  ).toBeEnabled()
})

test("overview keeps image output upright and preserves editor drafts", async ({
  page,
}) => {
  await page.goto(
    "/manage/devices/device?device=sample-image",
  )
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Draft name")
  const preview = page.getByRole("img", {
    name: "Desk display rendered output",
  })
  await expect(preview).toHaveCSS(
    "transform",
    /matrix\(-1, 0, 0, -1,/,
  )
  await page
    .getByRole("button", {
      name: "Preview orientation: Upright",
    })
    .click()
  await page
    .getByRole("option", {
      name: "Device output",
      exact: true,
    })
    .click()
  await expect(preview).toHaveCSS(
    "transform",
    /matrix\(1, 0, 0, 1,/,
  )
  await page
    .getByRole("button", {
      name: "All screens",
      exact: true,
    })
    .click()
  await expect(page).toHaveURL(/all-screens/)
  await expect(
    page.getByRole("heading", {
      name: "Desk display",
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    page.getByRole("img", {
      name: "Desk display rendered output",
    }),
  ).toHaveCSS("transform", /matrix\(-1, 0, 0, -1,/)
  await page
    .getByRole("button", {
      name: "Device settings",
      exact: true,
    })
    .click()
  await expect(
    page.getByRole("textbox", {
      name: "Name",
      exact: true,
    }),
  ).toHaveValue("Draft name")
})

test("a runtime quarter-turn is undone without cropping or changing the device", async ({
  page,
}) => {
  await page.route("**/api/devices/*/image?*", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      headers: { "X-CastKit-Rotation": "90" },
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="122" height="250"><rect width="122" height="250" fill="white"/></svg>',
    }),
  )
  await page.goto(
    "/manage/devices/device?device=sample-image",
  )
  const preview = page.getByRole("img", {
    name: "Desk display rendered output",
  })
  await expect(preview).toHaveCSS(
    "transform",
    /matrix\(0, -1, 1, 0,/,
  )
  const bounds = await page
    .locator(".preview-output")
    .boundingBox()
  expect(bounds?.width).toBe(250)
  expect(bounds?.height).toBe(122)
  await expect(
    page.getByText("No unsaved changes", { exact: true }),
  ).toBeVisible()
  await page
    .getByRole("button", {
      name: "Preview orientation: Upright",
    })
    .click()
  await page
    .getByRole("option", {
      name: "Device output",
      exact: true,
    })
    .click()
  await expect(preview).toHaveCSS(
    "transform",
    /matrix\(1, 0, 0, 1,/,
  )
  expect(
    (await page.locator(".preview-output").boundingBox())
      ?.height,
  ).toBe(250)
})

test("the overview includes independent screens without duplicating assigned screens", async ({
  page,
}) => {
  await page.route("**/api/manage/platform", (route) =>
    route.fulfill({
      json: {
        deviceScreens: { "sample-image": "assigned" },
        screens: [
          { id: "assigned", name: "Assigned screen" },
          { id: "lab", name: "Independent screen" },
        ],
        sources: [],
        channels: [],
        views: [],
        plugins: [],
        adapters: [],
        viewSpecs: [],
        presets: [],
        channelStates: {},
      },
    }),
  )
  await page.goto("/manage/all-screens")
  await expect(
    page.getByRole("heading", {
      name: "Independent screen",
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    page.getByRole("heading", {
      name: "Assigned screen",
      exact: true,
    }),
  ).toHaveCount(0)
  await expect(
    page.getByTitle("Independent screen browser preview"),
  ).toHaveAttribute("src", "/screen/lab?preview=1")
})
