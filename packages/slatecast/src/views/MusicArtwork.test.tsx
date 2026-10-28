import { render, waitFor } from "@testing-library/preact"
import { HttpResponse, http } from "msw"
import { setupWorker } from "msw/browser"
import { afterAll, beforeAll, expect, test } from "vitest"
import { buildMusicPlayer } from "../__fixtures__/buildMusicPlayer.ts"
import { CompactMusicPlayer } from "./CompactMusicPlayer.tsx"
import { MusicPlayer } from "./MusicPlayer.tsx"
import "../styles.css"
import "../platform/platform.css"

const worker = setupWorker(
  http.get(
    "*/music-artwork-:color.svg",
    ({ params }) =>
      new HttpResponse(
        `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="${params.color === "red" ? "#ef4848" : "#4868ef"}"/></svg>`,
        { headers: { "Content-Type": "image/svg+xml" } },
      ),
  ),
)
beforeAll(() =>
  worker.start({
    quiet: true,
    onUnhandledRequest: "bypass",
  }),
)
afterAll(() => worker.stop())

test.each([
  "compact",
  "full",
])("%s background follows each current track's artwork", async (presentation) => {
  document.documentElement.dataset.scheme = "dark"
  const data = buildMusicPlayer({ nowMs: Date.now() })
  const View =
    presentation === "compact"
      ? CompactMusicPlayer
      : MusicPlayer
  const content = (color: string) => (
    <main
      class="platform"
      style={{
        position: "relative",
        width: 969,
        height: 300,
        padding: 0,
      }}
    >
      <View
        data={{
          ...data,
          current: {
            ...data.current!,
            queueItemId: `artwork-${color}`,
            artworkPath: `/music-artwork-${color}.svg`,
          },
        }}
        layout="side-by-side"
        isLyricsTabVisible
        playedRowCount={2}
        isControlEnabled
        onAction={async () => undefined}
      />
    </main>
  )
  const mounted = render(content("red"))
  const card = mounted.container.querySelector(
    presentation === "compact"
      ? ".compact-music"
      : ".music-player",
  )!
  await waitFor(() =>
    expect(
      getComputedStyle(card).getPropertyValue(
        "--music-accent",
      ),
    ).toMatch(/rgb\(/),
  )
  const firstAccent = getComputedStyle(
    card,
  ).getPropertyValue("--music-accent")
  const first = getComputedStyle(card).backgroundImage
  expect(first).toContain("gradient")
  mounted.rerender(content("blue"))
  await waitFor(() => {
    expect(
      getComputedStyle(card).getPropertyValue(
        "--music-accent",
      ),
    ).toMatch(/rgb\(/)
    expect(
      getComputedStyle(card).getPropertyValue(
        "--music-accent",
      ),
    ).not.toBe(firstAccent)
    expect(getComputedStyle(card).backgroundImage).not.toBe(
      first,
    )
  })
})
