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
})
