import type { BrowserDeviceProfile } from "@castkit/shared/protocol/ws"
import type {
  NowPlayingData,
  QueueData,
} from "@castkit/shared/viewData/types"
import { screen } from "@testing-library/preact"
import userEvent from "@testing-library/user-event"
import { describe, expect, test } from "vitest"
import {
  buildDeviceProfile,
  buildNowPlaying,
  buildQueue,
  buildSnapshot,
} from "../__fixtures__/buildSnapshot.ts"
import { mountSlatecast } from "../__tests__/setup/mountSlatecast.tsx"
import { waitUntil } from "../__tests__/setup/slatecastServer.ts"

const mountNowPlaying = async ({
  nowPlaying = buildNowPlaying(),
  device = buildDeviceProfile(),
  queue,
}: {
  nowPlaying?: NowPlayingData
  device?: BrowserDeviceProfile
  queue?: QueueData
} = {}) =>
  mountSlatecast({
    snapshot: buildSnapshot({
      view: "now-playing",
      device,
      data: { nowPlaying, ...(queue ? { queue } : {}) },
    }),
  })

/**
 * The picture the view is showing now. On a touch device it sits in the middle
 * cell of the swipe rail, with a neighbouring cell either side of it; on a
 * touchless one it is the only picture on the page.
 */
const artwork = () =>
  document.querySelector(
    ".artwork-slot.is-current .artwork",
  ) ?? document.querySelector(".artwork")

/**
 * Drag the artwork through `offsets` pixels from where the finger landed, then
 * release unless `isReleased` is false.
 *
 * The frame is given real layout first: no stylesheet is loaded in the test
 * page, so without it `clientWidth` is zero and the handler has no width to
 * measure the commit distance against — the same reason the seek-bar test
 * sizes its track.
 */
const dragArtwork = async ({
  offsets,
  isReleased = true,
}: {
  offsets: readonly number[]
  isReleased?: boolean
}) => {
  const frame = document.querySelector(
    ".artwork-frame",
  ) as HTMLElement
  frame.style.width = "200px"
  frame.style.height = "200px"
  const rect = frame.getBoundingClientRect()
  const pointAt = (offsetX: number) => ({
    target: frame,
    coords: {
      clientX: rect.left + 100 + offsetX,
      clientY: rect.top + 100,
    },
  })
  const user = userEvent.setup()
  await user.pointer([
    { ...pointAt(0), keys: "[MouseLeft>]" },
    ...offsets.map(pointAt),
    ...(isReleased
      ? [
          {
            ...pointAt(offsets.at(-1) ?? 0),
            keys: "[/MouseLeft]",
          },
        ]
      : []),
  ])
}

const seekTimes = () =>
  Array.from(document.querySelectorAll(".seek-time")).map(
    (cell) => cell.textContent,
  )

describe("track metadata", () => {
  test("renders the title, artist and album", async () => {
    await mountNowPlaying()

    expect(screen.getByText("Roygbiv")).toBeVisible()
    expect(
      screen.getByText("Boards of Canada"),
    ).toBeVisible()
    expect(
      screen.getByText("Music Has the Right to Children"),
    ).toBeVisible()
  })

  test("leaves the album line out when the track has no album", async () => {
    await mountNowPlaying({
      nowPlaying: buildNowPlaying({ album: undefined }),
    })

    expect(screen.getByText("Roygbiv")).toBeVisible()
    expect(document.querySelector(".album")).toBeNull()
  })

  test("shows the idle notice with no title and no artist", async () => {
    await mountNowPlaying({
      nowPlaying: buildNowPlaying({
        title: "",
        artist: "",
      }),
    })

    expect(
      screen.getByText("Nothing playing"),
    ).toBeVisible()
    expect(screen.getByText("Dev Square")).toBeVisible()
    expect(document.querySelector(".seek")).toBeNull()
  })
})

describe("artwork", () => {
  test("renders the pushed artwork path as the image source", async () => {
    await mountNowPlaying({
      nowPlaying: buildNowPlaying({
        artworkPath: "/artwork/roygbiv.jpg",
      }),
    })

    const image = artwork() as HTMLImageElement
    expect(image.tagName).toBe("IMG")
    expect(image.getAttribute("src")).toBe(
      "/artwork/roygbiv.jpg",
    )
    expect(image).toBeVisible()
  })

  test("falls back to the note placeholder with no artwork", async () => {
    await mountNowPlaying()

    const placeholder = artwork() as HTMLElement
    expect(placeholder.tagName).toBe("DIV")
    expect(placeholder.className).toBe(
      "artwork placeholder",
    )
    expect(placeholder).toBeVisible()
  })
})

describe("artwork gestures", () => {
  test("a tap on the artwork toggles play and pause", async () => {
    const { server } = await mountNowPlaying()

    await dragArtwork({ offsets: [] })

    expect(server.commands).toEqual([
      { action: "play_pause" },
    ])
  })

  test("a nudge inside the slop band is still a tap", async () => {
    const { server } = await mountNowPlaying()

    await dragArtwork({ offsets: [-4] })

    expect(server.commands).toEqual([
      { action: "play_pause" },
    ])
    expect(document.querySelector(".swipe-hint")).toBeNull()
  })

  test("dragging the artwork left and releasing plays the next track", async () => {
    const { server } = await mountNowPlaying()

    await dragArtwork({ offsets: [-30, -90] })

    expect(server.commands).toEqual([{ action: "next" }])
  })

  test("dragging the artwork right and releasing plays the previous track", async () => {
    const { server } = await mountNowPlaying()

    await dragArtwork({ offsets: [30, 90] })

    expect(server.commands).toEqual([
      { action: "previous" },
    ])
  })

  test("bringing the artwork back to the middle cancels the change", async () => {
    const { server } = await mountNowPlaying()

    await dragArtwork({ offsets: [-90, -40, 0] })

    expect(server.commands).toEqual([])
  })

  test("a drag that never reaches the commit distance cancels", async () => {
    const { server } = await mountNowPlaying()

    await dragArtwork({ offsets: [-20, -40] })

    expect(server.commands).toEqual([])
  })

  test("the hint names the next track while the artwork is dragged left", async () => {
    await mountNowPlaying({ queue: buildQueue() })

    await dragArtwork({
      offsets: [-90],
      isReleased: false,
    })

    const hint = document.querySelector(
      ".swipe-hint",
    ) as HTMLElement
    expect(hint).toBeVisible()
    expect(hint.textContent).toContain("Next Song")
    expect(hint.textContent).toContain("Olson")
    // Past the commit distance, so the release will act.
    expect(hint.className).toContain("is-armed")
  })

  test("the hint labels the previous side, which Home Assistant cannot name", async () => {
    await mountNowPlaying({ queue: buildQueue() })

    await dragArtwork({ offsets: [90], isReleased: false })

    const hint = document.querySelector(
      ".swipe-hint",
    ) as HTMLElement
    expect(hint.textContent).toContain("Previous Song")
    expect(hint.textContent).not.toContain("Olson")
  })

  test("the next cell carries the next track's artwork", async () => {
    await mountNowPlaying({
      queue: buildQueue({
        items: [
          {
            title: "Roygbiv",
            artist: "Boards of Canada",
            isCurrent: true,
          },
          {
            title: "Olson",
            artist: "Boards of Canada",
            artworkPath: "/artwork/olson.jpg",
            isCurrent: false,
          },
        ],
      }),
    })

    const next = document.querySelector(
      ".artwork-slot.is-next .artwork",
    ) as HTMLImageElement
    expect(next.tagName).toBe("IMG")
    expect(next.getAttribute("src")).toBe(
      "/artwork/olson.jpg",
    )
  })

  test("a touchless device keeps a plain picture with no gesture target", async () => {
    await mountNowPlaying({
      device: buildDeviceProfile({ hasTouch: false }),
      nowPlaying: buildNowPlaying({
        artworkPath: "/artwork/roygbiv.jpg",
      }),
    })

    expect(
      document.querySelector(".artwork-frame"),
    ).toBeNull()
    expect((artwork() as HTMLElement).tagName).toBe("IMG")
  })
})

describe("controls", () => {
  test("offers transport and volume on a touch device", async () => {
    await mountNowPlaying()

    expect(
      screen.getByRole("button", {
        name: "Previous track",
      }),
    ).toBeVisible()
    expect(
      screen.getByRole("button", { name: "Pause" }),
    ).toBeVisible()
    expect(
      screen.getByRole("button", { name: "Next track" }),
    ).toBeVisible()
    expect(
      screen.getByRole("button", { name: "Mute" }),
    ).toBeVisible()
    expect(
      screen.getByRole("slider", { name: "Volume" }),
    ).toBeVisible()
    expect(
      document.querySelector(".seek-track")?.className,
    ).toBe("seek-track interactive")
  })

  test("hides every control on a touchless device", async () => {
    await mountNowPlaying({
      device: buildDeviceProfile({ hasTouch: false }),
    })

    expect(
      screen.queryByRole("button", { name: "Pause" }),
    ).toBeNull()
    expect(
      screen.queryByRole("button", { name: "Next track" }),
    ).toBeNull()
    expect(
      screen.queryByRole("slider", { name: "Volume" }),
    ).toBeNull()
    // The seek bar stays as a passive progress bar.
    expect(
      document.querySelector(".seek-track")?.className,
    ).toBe("seek-track")
  })
})

describe("seek bar", () => {
  test("renders the current position and the track duration", async () => {
    await mountNowPlaying({
      nowPlaying: buildNowPlaying({
        isPlaying: false,
        positionSeconds: 30,
        durationSeconds: 151,
      }),
    })

    expect(seekTimes()).toEqual(["0:30", "2:31"])
  })

  test("scrubs to where the finger lands and publishes one seek", async () => {
    const { server } = await mountNowPlaying({
      nowPlaying: buildNowPlaying({
        isPlaying: false,
        positionSeconds: 0,
        durationSeconds: 200,
      }),
    })
    const track = document.querySelector(
      ".seek-track",
    ) as HTMLElement
    // No stylesheet is loaded in the test page, so the track carries no
    // height of its own — give it real layout, because the handler divides
    // by its bounding rect.
    track.style.width = "200px"
    track.style.height = "20px"
    const rect = track.getBoundingClientRect()
    const user = userEvent.setup()
    const pointAt = (offsetX: number) => ({
      target: track,
      coords: {
        clientX: rect.left + offsetX,
        clientY: rect.top + 10,
      },
    })

    await user.pointer([
      { ...pointAt(20), keys: "[MouseLeft>]" },
      pointAt(100),
    ])

    // Mid-drag the bar follows the finger without publishing anything.
    expect(seekTimes()[0]).toBe("1:40")
    expect(server.commands).toEqual([])

    await user.pointer([
      pointAt(150),
      { ...pointAt(150), keys: "[/MouseLeft]" },
    ])

    await waitUntil(() => server.commands.length > 0)
    expect(server.commands).toEqual([
      { action: "seek", value: 150 },
    ])
    expect(seekTimes()[0]).toBe("2:30")
  })
})
