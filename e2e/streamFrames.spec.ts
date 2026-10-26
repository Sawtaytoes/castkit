import {
  type Browser,
  type BrowserContext,
  expect,
  type Page,
  test,
} from "@playwright/test"
import { E2E_STREAM_DEVICE_ID } from "./testServer.ts"

/**
 * A swipe destination the server draws ahead must be the frame the
 * image-stream worker would capture itself, byte for byte. Otherwise every
 * swipe that shows it sends a second, nearly full frame right behind it.
 *
 * The worker's side is reproduced exactly: `create_browser_context` in
 * `device-client/remote-display/worker.py` (480x480, scale 1, touch, mobile,
 * reduced motion), one long-lived page that switches views without reloading,
 * and the same CDP screenshot call. The test sizes its own context to the
 * panel, so it means the same thing in every window.
 */
test.describe.configure({ mode: "serial" })

const topic = (name: string) =>
  `castkit/${E2E_STREAM_DEVICE_ID}/${name}/set`

const publish = async (
  page: Page,
  name: string,
  payload: unknown,
) => {
  const response = await page.request.post(
    "/__test__/mqtt",
    {
      data: { topic: topic(name), payload },
    },
  )
  expect(response.ok()).toBe(true)
}

type FrameIndex = {
  tag: string
  frames: { view: string; key: string }[]
}

/** Hold index requests open, as the worker does, until `isReady`. */
const waitForIndex = async (
  page: Page,
  isReady: (index: FrameIndex) => boolean,
  after?: string,
): Promise<FrameIndex> => {
  const response = await page.request.get(
    `/d/${E2E_STREAM_DEVICE_ID}/stream-frames${after ? `?after=${after}` : ""}`,
    { timeout: 40_000 },
  )
  const index = (await response.json()) as FrameIndex
  return isReady(index)
    ? index
    : waitForIndex(page, isReady, index.tag)
}

const readServerFrame = async (
  page: Page,
  view: string,
) => {
  const response = await page.request.get(
    `/d/${E2E_STREAM_DEVICE_ID}/stream-frame/${view}`,
  )
  expect(response.ok()).toBe(true)
  const frame = (await response.json()) as {
    key: string
    png: string
    targets: unknown[]
  }
  return { ...frame, png: Buffer.from(frame.png, "base64") }
}

const createWorkerContext = (browser: Browser) =>
  browser.newContext({
    viewport: { width: 480, height: 480 },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
    reducedMotion: "reduce",
  })

/** The worker's test for a finished view (`PAGE_STATE_SCRIPT`), then a quiet DOM. */
const waitForSettledView = async (
  page: Page,
  view: string,
) => {
  await page.waitForFunction(
    (expected) => {
      const root = document.querySelector<HTMLElement>(
        "[data-castkit-ready]",
      )
      return (
        document.querySelector<HTMLElement>(".stage")
          ?.dataset.view === expected &&
        (!root || root.dataset.castkitReady === "true") &&
        !document.querySelector(
          '.platform-loading, .platform-view[aria-busy="true"], .navigation-feedback[data-phase="loading"]',
        )
      )
    },
    view,
    { timeout: 10_000 },
  )
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const quiet = { timer: 0 }
        const observer = new MutationObserver(() => {
          clearTimeout(quiet.timer)
          quiet.timer = window.setTimeout(finish, 500)
        })
        const finish = () => {
          observer.disconnect()
          resolve()
        }
        observer.observe(document, {
          subtree: true,
          childList: true,
          attributes: true,
          characterData: true,
        })
        quiet.timer = window.setTimeout(finish, 500)
      }),
  )
}

/** The worker's own capture call (`DisplaySession.run`, Presto branch). */
const captureLikeWorker = async (
  context: BrowserContext,
  page: Page,
) => {
  const cdp = await context.newCDPSession(page)
  const shot = (await cdp.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
    optimizeForSpeed: true,
  })) as { data: string }
  await cdp.detach()
  return Buffer.from(shot.data, "base64")
}

const buildTrack = ({
  title = "Fixture Song",
  position = 42,
}: {
  title?: string
  position?: number
} = {}) => ({
  artist: "Fixture Artist",
  title,
  album: "Fixture Album",
  // Paused, so the progress bar holds still between the two captures.
  isPlaying: false,
  position,
  duration: 210,
  artwork: new URL(
    "/__test__/artwork.svg",
    String(test.info().project.use.baseURL),
  ).href,
})

test("a frame drawn ahead is byte-identical to the worker's own capture of that view", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000)
  await publish(page, "now_playing", buildTrack())
  await publish(page, "view", "Now Playing")
  const context = await createWorkerContext(browser)
  const panel = await context.newPage()
  await panel.goto(`/d/${E2E_STREAM_DEVICE_ID}`)
  await waitForSettledView(panel, "now-playing")

  // From Now Playing, down opens the Queue; the way back is Now Playing.
  await waitForIndex(page, (index) =>
    ["queue", "now-playing"].every((view) =>
      index.frames.some((frame) => frame.view === view),
    ),
  )
  const nowPlaying = await readServerFrame(
    page,
    "now-playing",
  )
  // The worker shows a frame only with the touch targets read from it.
  expect(nowPlaying.targets).toContainEqual(
    expect.objectContaining({
      identity: "view-gesture:now-playing",
      loading: false,
    }),
  )
  expect(
    (await captureLikeWorker(context, panel)).equals(
      nowPlaying.png,
    ),
  ).toBe(true)

  const queue = await readServerFrame(page, "queue")
  // The page switches views in place, as the panel's long-lived page does.
  await publish(page, "view", "Queue")
  await waitForSettledView(panel, "queue")
  expect(
    (await captureLikeWorker(context, panel)).equals(
      queue.png,
    ),
  ).toBe(true)
  await context.close()
})

test("a new track draws Now Playing again, and a new position does not", async ({
  page,
}) => {
  test.setTimeout(60_000)
  const keyOf = (index: FrameIndex) =>
    index.frames.find(
      (frame) => frame.view === "now-playing",
    )?.key
  const before = await waitForIndex(
    page,
    (index) => keyOf(index) !== undefined,
  )
  await publish(
    page,
    "now_playing",
    buildTrack({ position: 99 }),
  )
  // The cache recomputes keys 150 ms after a change.
  await page.waitForTimeout(500)
  expect(
    keyOf(
      await waitForIndex(
        page,
        (index) => keyOf(index) !== undefined,
      ),
    ),
  ).toBe(keyOf(before))
  await publish(
    page,
    "now_playing",
    buildTrack({ title: "Another Song", position: 99 }),
  )
  const after = await waitForIndex(
    page,
    (index) =>
      keyOf(index) !== undefined &&
      keyOf(index) !== keyOf(before),
    before.tag,
  )
  expect(keyOf(after)).not.toBe(keyOf(before))
})

test("a clock frame drawn while one track played is the picture with any other track", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000)
  // The clock draws the minute: keep the whole test inside one.
  const secondsLeft = 60 - new Date().getSeconds()
  if (secondsLeft < 25) {
    await page.waitForTimeout((secondsLeft + 1) * 1000)
  }
  await publish(page, "view", "Queue")
  const hasAmbient = (index: FrameIndex) =>
    index.frames.some((frame) => frame.view === "ambient")
  await waitForIndex(page, hasAmbient)
  const before = await readServerFrame(page, "ambient")
  await publish(
    page,
    "now_playing",
    buildTrack({ title: "A Third Song" }),
  )
  // The cache recomputes keys 150 ms after a change.
  await page.waitForTimeout(500)
  const after = await readServerFrame(page, "ambient")
  expect(after.key).toBe(before.key)

  const context = await createWorkerContext(browser)
  const panel = await context.newPage()
  await publish(page, "view", "Ambient")
  await panel.goto(`/d/${E2E_STREAM_DEVICE_ID}`)
  await waitForSettledView(panel, "ambient")
  expect(
    (await captureLikeWorker(context, panel)).equals(
      before.png,
    ),
  ).toBe(true)
  await context.close()
})
