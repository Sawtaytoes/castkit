import type { NowPlayingData } from "@castkit/shared/viewData/types"
import { screen } from "@testing-library/preact"
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest"
import { page } from "vitest/browser"
import {
  buildDeviceProfile,
  buildNowPlaying,
  buildSnapshot,
} from "../__fixtures__/buildSnapshot.ts"
import { mountSlatecast } from "../__tests__/setup/mountSlatecast.tsx"
// The sibling test files load no stylesheet: they test behavior. This one
// tests a media query, so it needs the real rules in the page.
import "../styles.css"

/**
 * The 480×320 WT32 panel: wider than tall by a clear margin and short. The
 * square (720×720) and the round porthole (480×480) must not match.
 */
const SHORT_PANEL = { width: 480, height: 320 }
const SQUARE_PANEL = { width: 720, height: 720 }

const LONG_TITLE =
  "Symphony No. 5 in C minor, Op. 67: I. Allegro con brio (Live at the Semperoper, Dresden)"
const LONG_ARTIST =
  "Staatskapelle Dresden, Sächsischer Staatsopernchor & Christian Thielemann"
const LONG_ALBUM =
  "Legend of the Galactic Heroes: Die Neue These — Original Soundtrack"

const mountOnPanel = async ({
  width,
  height,
  nowPlaying,
}: {
  width: number
  height: number
  nowPlaying?: NowPlayingData
}) => {
  await page.viewport(width, height)
  await mountSlatecast({
    snapshot: buildSnapshot({
      view: "now-playing",
      device: buildDeviceProfile({ width, height }),
      ...(nowPlaying ? { data: { nowPlaying } } : {}),
    }),
  })
  // Row counts are measured, and the measure depends on the face.
  await document.fonts.ready
}

const rectOf = (selector: string) =>
  (
    document.querySelector(selector) as HTMLElement
  ).getBoundingClientRect()

const fontSizeOf = (selector: string) =>
  Number.parseFloat(
    getComputedStyle(
      document.querySelector(selector) as Element,
    ).fontSize,
  )

/** The row count the fit pass gave a line, read off the track's own style. */
const lineCountOf = (line: "title" | "artist" | "album") =>
  (
    document.querySelector(".track") as HTMLElement
  ).style.getPropertyValue(`--${line}-lines`)

describe("now playing on a short landscape panel", () => {
  beforeEach(async () => {
    await page.viewport(
      SHORT_PANEL.width,
      SHORT_PANEL.height,
    )
  })

  afterEach(async () => {
    await page.viewport(
      SQUARE_PANEL.width,
      SQUARE_PANEL.height,
    )
  })

  test("sets the art beside the text, centered on it, with no transport row", async () => {
    await mountOnPanel(SHORT_PANEL)

    const artwork = screen
      .getByRole("button", { name: /^Pause/ })
      .getBoundingClientRect()
    const title = rectOf(".title")
    // Side by side: the text starts to the right of the art, not under it.
    expect(title.left).toBeGreaterThan(artwork.right)
    // The art and the column it leaves are one decision, so assert both: 480
    // less 20px of padding, less the art, less the 14px gap.
    expect(artwork.width).toBe(216)
    expect(rectOf(".track").width).toBe(230)

    // The text and the seek bar sit as one block at the art's middle, not at
    // its foot.
    const track = rectOf(".track")
    const seek = rectOf(".seek")
    const blockMiddle = (track.top + seek.bottom) / 2
    const artMiddle = artwork.top + artwork.height / 2
    expect(
      Math.abs(blockMiddle - artMiddle),
    ).toBeLessThanOrEqual(4)

    // The art is the transport; there are no buttons to hide.
    expect(
      screen.queryByRole("button", {
        name: "Next track",
        hidden: true,
      }),
    ).toBeNull()
    expect(
      screen.getByRole("slider", { name: "Volume" }),
    ).toBeVisible()
  })

  test("wraps a long artist and album instead of clipping them", async () => {
    await mountOnPanel({
      ...SHORT_PANEL,
      nowPlaying: buildNowPlaying({
        title: "Blood Island",
        artist: LONG_ARTIST,
        album: LONG_ALBUM,
      }),
    })

    // Two rows each: 21px × 1.2 and 16px × 1.2.
    expect(rectOf(".artist").height).toBeGreaterThanOrEqual(
      50,
    )
    expect(rectOf(".album").height).toBeGreaterThanOrEqual(
      38,
    )
  })

  test("gives a long title the rows a short artist leaves over", async () => {
    await mountOnPanel({
      ...SHORT_PANEL,
      nowPlaying: buildNowPlaying({
        title: LONG_TITLE,
        artist: "Beck",
        album: "Odelay",
      }),
    })

    expect(lineCountOf("title")).toBe("4")
    // Four rows of 27px × 1.15.
    expect(rectOf(".title").height).toBeGreaterThanOrEqual(
      124,
    )
  })

  test("gives a long album name a third row rather than clipping it", async () => {
    await mountOnPanel({
      ...SHORT_PANEL,
      nowPlaying: buildNowPlaying({
        title: "Roygbiv",
        artist: "Boards of Canada",
        // 58 characters: two rows of the 230px column reach the "(20th
        // Anniversary" and the name used to end there.
        album:
          "Music Has the Right to Children (20th Anniversary Edition)",
      }),
    })

    expect(lineCountOf("album")).toBe("3")
    const album = document.querySelector(
      ".album",
    ) as HTMLElement
    // Nothing is cut: the clamp is not reached, so the rendered height is the
    // whole name's height.
    expect(
      album.scrollHeight - album.clientHeight,
    ).toBeLessThanOrEqual(1)
    // And it still ends above the volume row.
    expect(rectOf(".seek").bottom).toBeLessThanOrEqual(
      rectOf(".volume").top,
    )
  })

  test("keeps a 31-character album name on one row, which the 214px column could not", async () => {
    await mountOnPanel(SHORT_PANEL)

    // The fixture's album is "Music Has the Right to Children". At 232px of
    // art it wrapped to two rows for no reason.
    const album = document.querySelector(
      ".album",
    ) as HTMLElement
    const lineHeight = Number.parseFloat(
      getComputedStyle(album).lineHeight,
    )
    expect(
      Math.round(album.clientHeight / lineHeight),
    ).toBe(1)
  })

  test("trims the rows when every line is long, and keeps the block above the volume row", async () => {
    await mountOnPanel({
      ...SHORT_PANEL,
      nowPlaying: buildNowPlaying({
        title: LONG_TITLE,
        artist: LONG_ARTIST,
        album: LONG_ALBUM,
      }),
    })

    // The most generous budget (4/3/2) overflows the column; the pass steps
    // down until it fits rather than letting the text run under the volume.
    expect(lineCountOf("artist")).toBe("2")
    expect(rectOf(".seek").bottom).toBeLessThanOrEqual(
      rectOf(".volume").top,
    )
  })

  test("uses the fixed readable sizes, not vmin", async () => {
    await mountOnPanel(SHORT_PANEL)

    expect(fontSizeOf(".title")).toBe(27)
    expect(fontSizeOf(".artist")).toBe(21)
    expect(fontSizeOf(".seek-time")).toBe(16)
  })

  test("leaves the square panel on the vmin layout, with the art as the transport", async () => {
    await mountOnPanel(SQUARE_PANEL)

    // 5vmin of 720.
    expect(fontSizeOf(".title")).toBe(36)
    // 52vmin of 720: the picture took the transport row's space.
    expect(
      screen
        .getByRole("button", { name: /^Pause/ })
        .getBoundingClientRect().width,
    ).toBeCloseTo(374.4, 0)
    expect(
      screen.queryByRole("button", {
        name: "Next track",
        hidden: true,
      }),
    ).toBeNull()
    // The row counts are the stylesheet's own here, not the fit pass's.
    expect(lineCountOf("title")).toBe("")
  })
})
