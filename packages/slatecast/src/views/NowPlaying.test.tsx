import type { BrowserDeviceProfile } from "@castkit/shared/protocol/ws"
import type { NowPlayingData } from "@castkit/shared/viewData/types"
import { screen } from "@testing-library/preact"
import userEvent from "@testing-library/user-event"
import { describe, expect, test } from "vitest"
import {
  buildDeviceProfile,
  buildNowPlaying,
  buildSnapshot,
} from "../__fixtures__/buildSnapshot.ts"
import { mountSlatecast } from "../__tests__/setup/mountSlatecast.tsx"
import { waitUntil } from "../__tests__/setup/slatecastServer.ts"

const mountNowPlaying = async ({
  nowPlaying = buildNowPlaying(),
  device = buildDeviceProfile(),
}: {
  nowPlaying?: NowPlayingData
  device?: BrowserDeviceProfile
} = {}) =>
  mountSlatecast({
    snapshot: buildSnapshot({
      view: "now-playing",
      device,
      data: { nowPlaying },
    }),
  })

const artwork = () => document.querySelector(".artwork")

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
