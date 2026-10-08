import { inject, test } from "vitest"
import { page } from "vitest/browser"
import {
  buildNowPlaying,
  buildSnapshot,
} from "../__fixtures__/buildSnapshot.ts"
import { mountSlatecast } from "../__tests__/setup/mountSlatecast.tsx"
import { waitUntil } from "../__tests__/setup/slatecastServer.ts"
import "../styles.css"

test("album sliders keep neutral icons and time labels", async () => {
  await page.viewport(720, 720)
  const image = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#ed6094"/><circle cx="256" cy="256" r="160" fill="#3d2449"/></svg>')}`
  await mountSlatecast({
    snapshot: buildSnapshot({
      view: "now-playing",
      data: {
        nowPlaying: buildNowPlaying({
          artworkPath: image,
          isPlaying: false,
          positionSeconds: 42,
        }),
      },
    }),
  })
  await document.fonts.ready
  await waitUntil(() =>
    Boolean(
      document
        .querySelector<HTMLElement>(".now-playing")
        ?.style.getPropertyValue("--accent"),
    ),
  )
  await page.screenshot({
    path: `${inject("vrtActualDir")}/platform/album-controls-neutral-labels-720x720.png`,
    fullPage: false,
  })
})
