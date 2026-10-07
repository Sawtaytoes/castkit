import userEvent from "@testing-library/user-event"
import { describe, expect, test } from "vitest"
import {
  buildDeviceProfile,
  buildNowPlaying,
  buildSnapshot,
} from "./__fixtures__/buildSnapshot.ts"
import { mountSlatecast } from "./__tests__/setup/mountSlatecast.tsx"
import { waitUntil } from "./__tests__/setup/slatecastServer.ts"
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

  test("a configured left swipe asks the house for that view", async () => {
    const { server } = await mountView({
      leftSwipeViewId: "scores",
    })
    await swipe({ distanceY: 0, distanceX: -80 })
    await waitUntil(() => server.commands.length > 0)
    expect(server.commands).toEqual([
      { action: "view", value: "scores" },
    ])
  })

  test("a left artwork drag keeps track navigation instead of opening the configured view", async () => {
    const { server } = await mountView({
      view: "now-playing",
      leftSwipeViewId: "scores",
    })
    await swipe({
      selector: ".artwork-frame",
      distanceY: 0,
      distanceX: -180,
    })
    await waitUntil(() => server.commands.length > 0)
    expect(server.commands).toEqual([{ action: "next" }])
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
