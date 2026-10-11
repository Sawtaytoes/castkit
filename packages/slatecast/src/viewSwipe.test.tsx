import { fireEvent, screen } from "@testing-library/preact"
import userEvent from "@testing-library/user-event"
import { describe, expect, test } from "vitest"
import {
  buildDeviceProfile,
  buildNowPlaying,
  buildSnapshot,
} from "./__fixtures__/buildSnapshot.ts"
import { mountSlatecast } from "./__tests__/setup/mountSlatecast.tsx"
import { waitUntil } from "./__tests__/setup/slatecastServer.ts"
import { scrubPositionSeconds } from "./state.ts"
import { SWIPE_COMMIT_PIXELS } from "./viewSwipe.ts"

const mountView = async ({
  view = "calendar",
  hasTouch = true,
  leftSwipeViewId,
}: {
  view?: string
  hasTouch?: boolean
  leftSwipeViewId?: string
} = {}) =>
  mountSlatecast({
    snapshot: buildSnapshot({
      view,
      device: buildDeviceProfile({
        hasTouch,
        leftSwipeViewId,
        hasPrinterNavigation: true,
        views: [
          "now-playing",
          "queue",
          "calendar",
          "ambient",
          "printer-status",
          "print-queue",
        ].map((clientId) => ({ name: clientId, clientId })),
      }),
      data: { nowPlaying: buildNowPlaying() },
    }),
  })

/**
 * Drag a finger `distanceY` pixels down the element (negative is up) while it
 * also moves `distanceX` across, then release.
 *
 * The move is delivered in two steps. One jump from the landing point to the
 * end would still commit, but two is what a finger does, and it proves the
 * gesture survives being sampled part way.
 */
const swipe = async ({
  selector = ".stage",
  distanceY,
  distanceX = 0,
}: {
  selector?: string
  distanceY: number
  distanceX?: number
}) => {
  const target = document.querySelector(
    selector,
  ) as HTMLElement
  target.style.width = "400px"
  target.style.height = "400px"
  const rect = target.getBoundingClientRect()
  const pointAt = (fraction: number) => ({
    target,
    coords: {
      clientX: rect.left + 200 + distanceX * fraction,
      clientY: rect.top + 200 + distanceY * fraction,
    },
  })
  const user = userEvent.setup()
  await user.pointer([
    { ...pointAt(0), keys: "[MouseLeft>]" },
    pointAt(0.5),
    pointAt(1),
    { ...pointAt(1), keys: "[/MouseLeft]" },
  ])
}

describe("a vertical swipe asks the house for a view", () => {
  test.each([
    ["calendar", "printer-status"],
    ["printer-status", "print-queue"],
    ["print-queue", "printer-status"],
    ["queue", "now-playing"],
  ])("swiping from %s opens %s", async (view, requested) => {
    const { server } = await mountView({ view })
    await swipe({
      distanceY: view === "queue" ? 80 : 0,
      distanceX: view === "queue" ? 0 : 80,
    })
    await waitUntil(() => server.commands.length > 0)
    expect(server.commands).toEqual([
      { action: "view", value: requested },
    ])
  })

  test("pulling inward from the configured right edge asks the house for that view", async () => {
    const { server } = await mountView({
      leftSwipeViewId: "scores",
    })
    await swipe({
      selector: ".view-swipe-edge.is-right",
      distanceY: 0,
      distanceX: -80,
    })
    await waitUntil(() => server.commands.length > 0)
    expect(server.commands).toEqual([
      { action: "view", value: "scores" },
    ])
  })

  test("a sideways drag in the middle does not open the configured edge view", async () => {
    const { server } = await mountView({
      leftSwipeViewId: "scores",
    })
    await swipe({ distanceY: 0, distanceX: -80 })
    expect(server.commands).toEqual([])
  })

  test.each([
    [-180, "next"],
    [180, "previous"],
  ])("an artwork drag (%s) keeps %s track navigation", async (distanceX, action) => {
    const { server } = await mountView({
      view: "now-playing",
      leftSwipeViewId: "scores",
    })
    await swipe({
      selector: ".artwork-frame",
      distanceY: 0,
      distanceX,
    })
    await waitUntil(() => server.commands.length > 0)
    expect(server.commands).toEqual([{ action }])
  })

  test("an unconfigured left swipe stays unassigned", async () => {
    const { server } = await mountView()
    await swipe({ distanceY: 0, distanceX: -80 })
    expect(server.commands).toEqual([])
  })

  test("the right edge carries the left swipe over an external view", async () => {
    const { server } = await mountView({
      leftSwipeViewId: "scores",
    })
    await swipe({
      selector: ".view-swipe-edge.is-right",
      distanceY: 0,
      distanceX: -80,
    })
    await waitUntil(() => server.commands.length > 0)
    expect(server.commands).toEqual([
      { action: "view", value: "scores" },
    ])
  })

  test("swiping down asks for now playing", async () => {
    const { server } = await mountView()

    await swipe({ distanceY: SWIPE_COMMIT_PIXELS + 10 })

    await waitUntil(() => server.commands.length > 0)
    expect(server.commands).toEqual([
      { action: "view", value: "now-playing" },
    ])
  })

  test("swiping up asks for ambient on an empty day", async () => {
    const { server } = await mountView({
      view: "now-playing",
    })

    await swipe({
      distanceY: -(SWIPE_COMMIT_PIXELS + 10),
    })

    await waitUntil(() => server.commands.length > 0)
    expect(server.commands).toEqual([
      { action: "view", value: "ambient" },
    ])
  })

  test("a second audio swipe opens the queue", async () => {
    const { server } = await mountView({
      view: "now-playing",
    })

    await swipe({ distanceY: SWIPE_COMMIT_PIXELS + 10 })

    await waitUntil(() => server.commands.length > 0)
    expect(server.commands).toEqual([
      { action: "view", value: "queue" },
    ])
  })

  test("a short drag is not a swipe", async () => {
    const { server } = await mountView()

    await swipe({ distanceY: SWIPE_COMMIT_PIXELS - 10 })

    expect(server.commands).toEqual([])
  })

  test("a mostly sideways drag is not a swipe", async () => {
    const { server } = await mountView()

    await swipe({
      distanceY: SWIPE_COMMIT_PIXELS + 10,
      distanceX: -(SWIPE_COMMIT_PIXELS + 40),
    })

    expect(server.commands).toEqual([])
  })

  test("a touchless device never swipes", async () => {
    const { server } = await mountView({
      hasTouch: false,
    })

    await swipe({ distanceY: SWIPE_COMMIT_PIXELS + 10 })

    expect(server.commands).toEqual([])
  })

  test("a swipe that starts on the artwork does not also stop the music", async () => {
    const { server } = await mountView({
      view: "now-playing",
    })

    await swipe({
      selector: ".artwork-frame",
      distanceY: -(SWIPE_COMMIT_PIXELS + 10),
    })

    await waitUntil(() => server.commands.length > 0)
    expect(server.commands).toEqual([
      { action: "view", value: "ambient" },
    ])
  })
})

describe("music sliders own their contacts", () => {
  test.each([
    [100, 0],
    [20, -100],
  ])("a seek drag (%s, %s) sends only the seek", async (distanceX, distanceY) => {
    const { server } = await mountView({
      view: "now-playing",
    })
    await swipe({
      selector: ".seek-track",
      distanceX,
      distanceY,
    })
    await waitUntil(() => server.commands.length > 0)
    expect(server.commands).toHaveLength(1)
    expect(server.commands[0]?.action).toBe("seek")
  })

  test("cancelling a seek discards the preview and a stray release", async () => {
    const { server } = await mountView({
      view: "now-playing",
    })
    const target = screen.getByRole("slider", {
      name: "Seek",
    })
    target.style.width = "200px"
    target.style.height = "20px"
    const bounds = target.getBoundingClientRect()
    const user = userEvent.setup()
    const point = {
      target,
      coords: {
        clientX: bounds.left + 100,
        clientY: bounds.top + 10,
      },
    }
    await user.pointer({ ...point, keys: "[MouseLeft>]" })
    expect(scrubPositionSeconds.value).not.toBeNull()
    fireEvent.pointerCancel(target, { pointerId: 1 })
    expect(scrubPositionSeconds.value).toBeNull()
    await user.pointer({ ...point, keys: "[/MouseLeft]" })
    expect(server.commands).toEqual([])
  })

  test("an upward pull that lands on volume sends no music or view command", async () => {
    const { server } = await mountView({
      view: "now-playing",
    })
    await swipe({
      selector: 'input[type="range"]',
      distanceX: 10,
      distanceY: -100,
    })
    expect(server.commands).toEqual([])
    expect(
      screen.getByRole("slider", { name: "Volume" }),
    ).toHaveValue("50")
  })

  test("a horizontal volume drag keeps adjusting outside the track without navigation", async () => {
    const { server } = await mountView({
      view: "now-playing",
    })
    await swipe({
      selector: 'input[type="range"]',
      distanceX: 250,
      distanceY: -100,
    })
    await waitUntil(
      () => server.commands.at(-1)?.value === 1,
    )
    expect(
      server.commands.every(
        (command) => command.action === "volume_set",
      ),
    ).toBe(true)
  })
})
