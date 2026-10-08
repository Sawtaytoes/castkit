import { inject, test } from "vitest"
import { page } from "vitest/browser"
import {
  buildNowPlaying,
  buildQueue,
  buildSnapshot,
} from "../__fixtures__/buildSnapshot.ts"
import { mountSlatecast } from "../__tests__/setup/mountSlatecast.tsx"
import { waitUntil } from "../__tests__/setup/slatecastServer.ts"
import "../styles.css"

const items = Array.from(
  { length: 46 },
  (_unused, index) => ({
    title: `Track ${index + 1}`,
    artist: "Fixture artist",
    durationSeconds: 180,
    isCurrent: index === 21,
  }),
)

test.each([
  { width: 480, height: 480 },
  { width: 480, height: 320 },
  { width: 1280, height: 720 },
])("audio queue fits history and upcoming tracks at $width by $height", async ({
  width,
  height,
}) => {
  await page.viewport(width, height)
  await mountSlatecast({
    snapshot: buildSnapshot({
      view: "queue",
      data: {
        queue: buildQueue({ items }),
        nowPlaying: buildNowPlaying(),
      },
    }),
  })
  await document.fonts.ready
  await waitUntil(
    () => document.querySelectorAll(".queue li").length > 2,
  )
  await page.screenshot({
    path: `${inject("vrtActualDir")}/platform/audio-queue-history-${width}x${height}.png`,
    fullPage: false,
  })
})
