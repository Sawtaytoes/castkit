import { fireEvent, screen } from "@testing-library/preact"
import userEvent from "@testing-library/user-event"
import { describe, expect, test } from "vitest"
import {
  buildDeviceProfile,
  buildSettings,
  buildSnapshot,
} from "./__fixtures__/buildSnapshot.ts"
import { mountSlatecast } from "./__tests__/setup/mountSlatecast.tsx"
import { waitUntil } from "./__tests__/setup/slatecastServer.ts"
import { EDGE_HAND_BACK_COMMIT_PIXELS } from "./HandBackEdge.tsx"

const mountPanel = async ({
  isViewHeld,
}: {
  isViewHeld: boolean
}) =>
  mountSlatecast({
    snapshot: buildSnapshot({
      device: buildDeviceProfile(),
      settings: buildSettings({ isViewHeld }),
      view: "clock",
    }),
  })

const edges = () =>
  screen.queryAllByRole("button", {
    name: "Return to the automatic view",
  })

describe("the hand-back edge", () => {
  test("does not exist while nothing holds the panel", async () => {
    await mountPanel({ isViewHeld: false })

    expect(edges()).toHaveLength(0)
  })

  test("appears the moment Home Assistant says the panel is held", async () => {
    const { server } = await mountPanel({
      isViewHeld: false,
    })

    server.push({
      type: "settings",
      settings: buildSettings({ isViewHeld: true }),
    })

    await waitUntil(() => edges().length === 2)
  })

  test("draws nothing — the region carries no glyph and no label", async () => {
    await mountPanel({ isViewHeld: true })

    edges().forEach((edge) => {
      expect(edge.textContent).toBe("")
      expect(edge.children).toHaveLength(0)
    })
  })

  test("a tap hands the panel back", async () => {
    const { server } = await mountPanel({
      isViewHeld: true,
    })
    const user = userEvent.setup()

    await user.click(edges()[0] as Element)

    await waitUntil(() => server.commands.length > 0)
    expect(server.commands).toEqual([
      { action: "view_release" },
    ])
    expect(
      screen.getByText("Back to automatic"),
    ).toBeVisible()
  })

  test("an inward pull from the right edge hands the panel back", async () => {
    const { server } = await mountPanel({
      isViewHeld: true,
    })
    const rightEdge = edges()[1] as Element

    fireEvent.pointerDown(rightEdge, {
      pointerId: 1,
      clientX: 1_270,
    })
    fireEvent.pointerMove(rightEdge, {
      pointerId: 1,
      clientX: 1_270 - EDGE_HAND_BACK_COMMIT_PIXELS,
    })

    await waitUntil(() => server.commands.length > 0)
    expect(server.commands).toEqual([
      { action: "view_release" },
    ])
  })

  test("a pull that never travels far enough still ends as a tap", async () => {
    const { server } = await mountPanel({
      isViewHeld: true,
    })
    const leftEdge = edges()[0] as Element

    fireEvent.pointerDown(leftEdge, {
      pointerId: 2,
      clientX: 4,
    })
    fireEvent.pointerMove(leftEdge, {
      pointerId: 2,
      clientX: 12,
    })
    expect(server.commands).toEqual([])

    fireEvent.pointerUp(leftEdge, {
      pointerId: 2,
      clientX: 12,
    })

    await waitUntil(() => server.commands.length > 0)
    expect(server.commands).toEqual([
      { action: "view_release" },
    ])
  })

  test("a committed pull sends once, not again on release", async () => {
    const { server } = await mountPanel({
      isViewHeld: true,
    })
    const leftEdge = edges()[0] as Element

    fireEvent.pointerDown(leftEdge, {
      pointerId: 3,
      clientX: 0,
    })
    fireEvent.pointerMove(leftEdge, {
      pointerId: 3,
      clientX: EDGE_HAND_BACK_COMMIT_PIXELS + 20,
    })
    fireEvent.pointerUp(leftEdge, {
      pointerId: 3,
      clientX: EDGE_HAND_BACK_COMMIT_PIXELS + 20,
    })

    await waitUntil(() => server.commands.length > 0)
    expect(server.commands).toEqual([
      { action: "view_release" },
    ])
  })
})
