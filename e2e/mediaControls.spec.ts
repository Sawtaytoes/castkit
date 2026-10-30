import { expect, type Page, test } from "@playwright/test"
import { E2E_DEVICE_ID, e2eTopics } from "./testServer.ts"

/**
 * Full round trip against the real server: HA publishes over MQTT, the server
 * fans it out over the WebSocket, the SPA renders it; a tap goes back the other
 * way and lands on the command topic.
 *
 * Serial, and never asserting a pristine starting state: one server process
 * holds one device's retained view data, so tests share it. Each test publishes
 * what it needs and asserts deltas.
 */
test.describe.configure({ mode: "serial" })

const publishFromHomeAssistant = async ({
  page,
  topic,
  payload,
}: {
  page: Page
  topic: string
  payload: unknown
}) => {
  const response = await page.request.post(
    "/__test__/mqtt",
    { data: { topic, payload } },
  )
  expect(response.ok()).toBe(true)
}

const readCommands = async (page: Page) => {
  const response = await page.request.get(
    "/__test__/published",
  )
  const published = (await response.json()) as {
    topic: string
    payload: string
  }[]
  // The server stamps each command with a `ts`, so parse and drop it —
  // asserting on the raw payload string would bake in a timestamp.
  return published
    .filter(
      (message) => message.topic === e2eTopics.command,
    )
    .map((message) => {
      const { ts, ...command } = JSON.parse(
        message.payload,
      ) as Record<string, unknown>
      return command
    })
}

const buildNowPlayingPayload = ({
  isPlaying = true,
  title = "Roygbiv",
}: {
  isPlaying?: boolean
  title?: string
} = {}) => ({
  artist: "Boards of Canada",
  title,
  album: "Music Has the Right to Children",
  isPlaying,
  position: 30,
  duration: 151,
  volume: 0.5,
  isMuted: false,
})

test.describe("Media Controls end to end", () => {
  test.beforeEach(async ({ page }) => {
    await publishFromHomeAssistant({
      page,
      topic: e2eTopics.view,
      payload: "Now Playing",
    })
    await page.goto(`/d/${E2E_DEVICE_ID}`)
  })

  test("serves the device page shell with an inlined snapshot", async ({
    page,
  }) => {
    const snapshot = await page
      .locator("#castkit-state")
      .textContent()
    expect(
      JSON.parse(snapshot ?? "{}").device,
    ).toMatchObject({
      id: E2E_DEVICE_ID,
      hasTouch: true,
      shape: "square",
    })
  })

  test("renders a track Home Assistant publishes after the page is open", async ({
    page,
  }) => {
    await publishFromHomeAssistant({
      page,
      topic: e2eTopics.nowPlaying,
      payload: buildNowPlayingPayload({
        title: "Olson",
      }),
    })

    await expect(page.getByText("Olson")).toBeVisible()
    await expect(
      page.getByText("Boards of Canada"),
    ).toBeVisible()
  })

  test("a pause tap reaches the MQTT command topic", async ({
    page,
  }) => {
    await publishFromHomeAssistant({
      page,
      topic: e2eTopics.nowPlaying,
      payload: buildNowPlayingPayload({ isPlaying: true }),
    })
    const pause = page.getByRole("button", {
      name: "Pause",
    })
    await expect(pause).toBeVisible()
    const before = await readCommands(page)

    await pause.click()

    // Optimistic: the icon flips before HA has answered anything.
    await expect(
      page.getByRole("button", { name: "Play" }),
    ).toBeVisible()

    await expect
      .poll(async () =>
        (await readCommands(page)).slice(before.length),
      )
      .toEqual([{ action: "play_pause" }])
  })

  test("a volume drag publishes the final value", async ({
    page,
  }) => {
    await publishFromHomeAssistant({
      page,
      topic: e2eTopics.nowPlaying,
      payload: buildNowPlayingPayload(),
    })
    const slider = page.getByRole("slider", {
      name: "Volume",
    })
    await expect(slider).toBeVisible()
    const before = await readCommands(page)

    await slider.fill("85")

    await expect
      .poll(async () =>
        (await readCommands(page))
          .slice(before.length)
          .at(-1),
      )
      .toEqual({ action: "volume_set", value: 0.85 })
  })

  test("a real upward touch on volume leaves the volume unchanged", async ({
    page,
  }) => {
    await publishFromHomeAssistant({
      page,
      topic: e2eTopics.nowPlaying,
      payload: buildNowPlayingPayload(),
    })
    const slider = page.getByRole("slider", {
      name: "Volume",
    })
    await expect(slider).toBeVisible()
    const bounds = await slider.boundingBox()
    if (!bounds) {
      throw new Error("Volume slider has no touch area")
    }
    const before = await readCommands(page)
    const session = await page.context().newCDPSession(page)
    const point = {
      x: bounds.x + bounds.width * 0.8,
      y: bounds.y + bounds.height / 2,
      id: 0,
    }
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [point],
    })
    await expect(slider).toHaveValue("50")
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ ...point, y: point.y - 100 }],
    })
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    })
    await expect(slider).toHaveValue("50")
    expect(
      (await readCommands(page)).slice(before.length),
    ).toEqual([])
    await session.detach()
  })

  test("a real volume drag keeps its contact beyond the navigation threshold", async ({
    page,
  }) => {
    await publishFromHomeAssistant({
      page,
      topic: e2eTopics.nowPlaying,
      payload: buildNowPlayingPayload(),
    })
    const slider = page.getByRole("slider", {
      name: "Volume",
    })
    await expect(slider).toBeVisible()
    const bounds = await slider.boundingBox()
    if (!bounds) {
      throw new Error("Volume slider has no touch area")
    }
    const before = await readCommands(page)
    const session = await page.context().newCDPSession(page)
    const point = {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
      id: 0,
    }
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [point],
    })
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { ...point, x: bounds.x + bounds.width * 0.9 },
      ],
    })
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    })
    await expect
      .poll(async () =>
        (await readCommands(page))
          .slice(before.length)
          .at(-1),
      )
      .toEqual({ action: "volume_set", value: 0.9 })
    await slider.press("ArrowLeft")
    await expect(slider).toHaveValue("89")
    await expect
      .poll(async () =>
        (await readCommands(page))
          .slice(before.length)
          .at(-1),
      )
      .toEqual({ action: "volume_set", value: 0.89 })
    expect(
      (await readCommands(page))
        .slice(before.length)
        .every(
          (command) => command.action === "volume_set",
        ),
    ).toBe(true)
    await session.detach()
  })

  test("a bottom-edge pull requests time without touching music volume", async ({
    page,
  }) => {
    await publishFromHomeAssistant({
      page,
      topic: e2eTopics.nowPlaying,
      payload: buildNowPlayingPayload(),
    })
    const edge = page.getByRole("button", {
      name: "Pull inward from the bottom for time",
    })
    await expect(edge).toBeVisible()
    const bounds = await edge.boundingBox()
    if (!bounds) {
      throw new Error("Bottom edge has no touch area")
    }
    const before = await readCommands(page)
    const session = await page.context().newCDPSession(page)
    const point = {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
      id: 0,
    }
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [point],
    })
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ ...point, y: point.y - 150 }],
    })
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    })
    await expect
      .poll(async () =>
        (await readCommands(page)).slice(before.length),
      )
      .toEqual([
        {
          action: "view",
          value: "ambient",
          navigationId: expect.any(String),
        },
      ])
    await expect(
      page.getByRole("slider", { name: "Volume" }),
    ).toBeHidden()
    await session.detach()
  })

  test("a view message swaps the rendered view", async ({
    page,
  }) => {
    await publishFromHomeAssistant({
      page,
      topic: e2eTopics.nowPlaying,
      payload: buildNowPlayingPayload(),
    })
    await expect(page.getByText("Roygbiv")).toBeVisible()

    // The view topic takes the HA-facing display name, not the client id.
    await publishFromHomeAssistant({
      page,
      topic: e2eTopics.view,
      payload: "Clock",
    })

    await expect(page.getByText("Roygbiv")).toBeHidden()

    await publishFromHomeAssistant({
      page,
      topic: e2eTopics.view,
      payload: "Now Playing",
    })
    await expect(page.getByText("Roygbiv")).toBeVisible()
  })

  test("serves a receiver manifest and a configured external view", async ({
    page,
  }) => {
    const manifestResponse = await page.request.get(
      `/d/${E2E_DEVICE_ID}/castkit.json`,
    )
    expect(manifestResponse.ok()).toBe(true)
    await expect(
      manifestResponse.json(),
    ).resolves.toMatchObject({
      viewport: { width: 720, height: 720 },
      page_url: `/d/${E2E_DEVICE_ID}`,
      input: {
        target_attribute: "data-castkit-target",
      },
    })

    await publishFromHomeAssistant({
      page,
      topic: e2eTopics.view,
      payload: "Disc App",
    })

    const externalFrame = page.frameLocator(
      'iframe[title="Disc App"]',
    )
    await expect(
      externalFrame.getByRole("button", {
        name: "External control",
      }),
    ).toBeVisible()
  })

  test("the on-screen drawer exits an external view without an HA response", async ({
    page,
  }) => {
    await publishFromHomeAssistant({
      page,
      topic: e2eTopics.view,
      payload: "Disc App",
    })
    await expect(
      page
        .frameLocator('iframe[title="Disc App"]')
        .getByRole("button", { name: "External control" }),
    ).toBeVisible()
    const before = await readCommands(page)

    await page
      .getByRole("button", {
        name: "Open views from right edge",
      })
      .click()
    await page
      .getByRole("button", { name: "Touch Test" })
      .click()

    await expect(
      page.getByRole("heading", { name: "Touch test" }),
    ).toBeVisible()
    await expect
      .poll(async () =>
        (await readCommands(page)).slice(before.length),
      )
      .toEqual([
        {
          action: "view",
          value: "touch-test",
          navigationId: expect.any(String),
        },
      ])
  })
})

test("artwork without upstream CORS still colors music controls and survives play/pause", async ({
  page,
  baseURL,
}) => {
  const upstream = new URL("/__test__/artwork.svg", baseURL)
  upstream.hostname = "127.0.0.1"
  const source = await page.request.get(upstream.toString())
  expect(
    source.headers()["access-control-allow-origin"],
  ).toBeUndefined()
  await publishFromHomeAssistant({
    page,
    topic: e2eTopics.view,
    payload: "Now Playing",
  })
  const payload = {
    ...buildNowPlayingPayload({
      title: "Cross-origin artwork fixture",
    }),
    artwork: upstream.toString(),
  }
  await publishFromHomeAssistant({
    page,
    topic: e2eTopics.nowPlaying,
    payload,
  })
  await page.goto(`/d/${E2E_DEVICE_ID}`)
  const accent = () =>
    page
      .locator(".now-playing")
      .evaluate((element) =>
        (element as HTMLElement).style.getPropertyValue(
          "--accent",
        ),
      )
  await expect.poll(accent).not.toBe("")
  const sampled = await accent()
  const artwork = page.locator(
    ".artwork-slot.is-current img",
  )
  await expect(artwork).toHaveAttribute(
    "src",
    new RegExp(
      `^/d/${E2E_DEVICE_ID}/artwork/[a-f0-9]{24}$`,
    ),
  )
  const path = await artwork.getAttribute("src")
  const image = await page.request.get(path ?? "")
  expect(image.status()).toBe(200)
  expect(image.headers()["content-type"]).toContain(
    "image/svg+xml",
  )
  await publishFromHomeAssistant({
    page,
    topic: e2eTopics.nowPlaying,
    payload: { ...payload, isPlaying: false },
  })
  await expect(
    page.getByRole("button", {
      name: "Play Cross-origin artwork fixture",
    }),
  ).toBeVisible()
  expect(await accent()).toBe(sampled)
  await publishFromHomeAssistant({
    page,
    topic: e2eTopics.nowPlaying,
    payload: {
      ...payload,
      artwork: `${upstream}?rotated=1`,
    },
  })
  await expect(
    page.getByRole("button", {
      name: "Pause Cross-origin artwork fixture",
    }),
  ).toBeVisible()
  await expect.poll(accent).toBe(sampled)
})

test("a touch queue scrolls without returning to time, and its edge still navigates", async ({
  page,
}) => {
  await page.setViewportSize({ width: 480, height: 480 })
  await publishFromHomeAssistant({
    page,
    topic: e2eTopics.queue,
    payload: {
      items: Array.from({ length: 46 }, (_, index) => ({
        title: `Scroll track ${index + 1}`,
        artist: "Fixture artist",
        isCurrent: index === 21,
      })),
    },
  })
  await publishFromHomeAssistant({
    page,
    topic: e2eTopics.view,
    payload: "Queue",
  })
  await page.goto(`/d/${E2E_DEVICE_ID}`)
  const list = page.getByRole("list", {
    name: "Audio queue",
  })
  await expect(list.locator("li")).toHaveCount(46)
  const before = await list.evaluate(
    (element) => element.scrollTop,
  )
  const commands = await readCommands(page)
  await page.screenshot({
    path: "__screenshots__/queue-scroll-before.png",
  })
  const session = await page.context().newCDPSession(page)
  await session.send("Emulation.setTouchEmulationEnabled", {
    enabled: true,
  })
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: 240, y: 350 }],
  })
  await [320, 290, 260, 230, 200, 170].reduce(
    async (previous, height) => {
      await previous
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: 240, y: height }],
      })
    },
    Promise.resolve(),
  )
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  })
  await expect
    .poll(() =>
      list.evaluate((element) => element.scrollTop),
    )
    .toBeGreaterThan(before + 80)
  expect(await readCommands(page)).toEqual(commands)
  await expect(page.locator(".stage")).toHaveAttribute(
    "data-view",
    "queue",
  )
  await page.screenshot({
    path: "__screenshots__/queue-scroll-after.png",
  })
  const edge = page.locator(".view-swipe-edge.is-bottom")
  await edge.dispatchEvent("pointerdown", {
    bubbles: true,
    pointerId: 8,
    clientX: 240,
    clientY: 475,
  })
  await edge.dispatchEvent("pointermove", {
    bubbles: true,
    pointerId: 8,
    clientX: 240,
    clientY: 350,
  })
  await edge.dispatchEvent("pointerup", {
    bubbles: true,
    pointerId: 8,
    clientX: 240,
    clientY: 350,
  })
  await expect
    .poll(() => readCommands(page))
    .toHaveLength(commands.length + 1)
  await session.detach()
})
