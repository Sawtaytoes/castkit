import "./styles.css"
import { fireEvent, screen } from "@testing-library/preact"
import { describe, expect, test } from "vitest"
import {
  buildDeviceProfile,
  buildSnapshot,
} from "./__fixtures__/buildSnapshot.ts"
import { mountSlatecast } from "./__tests__/setup/mountSlatecast.tsx"
import { waitUntil } from "./__tests__/setup/slatecastServer.ts"

const mountExternal = () =>
  mountSlatecast({
    snapshot: buildSnapshot({
      view: "external-view:0",
      device: buildDeviceProfile({
        hasViewDrawer: true,
        externalViews: [
          { name: "External app", url: "about:blank" },
        ],
        views: [
          "now-playing",
          "queue",
          "ambient",
          "external-view:0",
        ].map((clientId) => ({ name: clientId, clientId })),
      }),
    }),
  })

const drag = ({
  target,
  startX,
  startY,
  endX = startX,
  endY = startY,
  isCancelled = false,
}: {
  target: HTMLElement
  startX: number
  startY: number
  endX?: number
  endY?: number
  isCancelled?: boolean
}) => {
  fireEvent.pointerDown(target, {
    pointerId: 7,
    clientX: startX,
    clientY: startY,
  })
  fireEvent.pointerMove(target, {
    pointerId: 7,
    clientX: endX,
    clientY: endY,
  })
  const finish = isCancelled
    ? fireEvent.pointerCancel
    : fireEvent.pointerUp
  finish(target, {
    pointerId: 7,
    clientX: endX,
    clientY: endY,
  })
}

describe("shell navigation from all four edges", () => {
  test.each([
    [
      "top",
      "Pull inward from the top for audio",
      "now-playing",
      80,
    ],
    [
      "bottom",
      "Pull inward from the bottom for time",
      "ambient",
      -80,
    ],
  ])("the %s edge requests %s above an external iframe", async (edge, label, view, distance) => {
    const { server } = await mountExternal()
    const target = screen.getByRole("button", {
      name: label,
    })
    const bounds = target.getBoundingClientRect()
    const startX = bounds.left + bounds.width / 2
    const startY = bounds.top + bounds.height / 2
    expect(document.elementFromPoint(startX, startY)).toBe(
      target,
    )
    expect(target).toHaveAttribute(
      "data-castkit-target",
      `navigation-edge:${edge}`,
    )

    drag({
      target,
      startX,
      startY,
      endY: startY + Number(distance),
    })

    await waitUntil(() => server.commands.length > 0)
    expect(server.commands).toEqual([
      { action: "view", value: view },
    ])
  })

  test.each([
    "left",
    "right",
  ])("the full %s edge opens the drawer without painted handles", async (edge) => {
    await mountExternal()
    const target = screen.getByRole("button", {
      name: `Open views from ${edge} edge`,
    })
    const bounds = target.getBoundingClientRect()
    const startX = bounds.left + bounds.width / 2
    const startY = bounds.top + 60
    expect(document.elementFromPoint(startX, startY)).toBe(
      target,
    )
    expect(bounds.height).toBe(window.innerHeight)
    expect(getComputedStyle(target).backgroundColor).toBe(
      "rgba(0, 0, 0, 0)",
    )
    expect(target.textContent).toBe("")

    drag({
      target,
      startX,
      startY,
      endX: startX + (edge === "left" ? 80 : -80),
    })

    expect(
      screen.getByRole("dialog", { name: "Views" }),
    ).toBeVisible()
    const choice = screen.getByRole("button", {
      name: "ambient",
    })
    expect(choice).toHaveAttribute(
      "data-castkit-target",
      "view-drawer:select:ambient",
    )
    const choiceBounds = choice.getBoundingClientRect()
    expect(
      document
        .elementFromPoint(
          choiceBounds.left + choiceBounds.width / 2,
          choiceBounds.top + choiceBounds.height / 2,
        )
        ?.closest("[data-castkit-target]"),
    ).toBe(choice)
  })

  test("a cancelled edge pull sends no view request and the next pull still works", async () => {
    const { server } = await mountExternal()
    const target = screen.getByRole("button", {
      name: "Pull inward from the top for audio",
    })
    drag({
      target,
      startX: 100,
      startY: 10,
      endY: 100,
      isCancelled: true,
    })
    expect(server.commands).toEqual([])
    drag({ target, startX: 100, startY: 10, endY: 100 })
    await waitUntil(() => server.commands.length > 0)
    expect(server.commands).toEqual([
      { action: "view", value: "now-playing" },
    ])
  })

  test("returning an edge drag to its start cancels navigation", async () => {
    const { server } = await mountExternal()
    const target = screen.getByRole("button", {
      name: "Pull inward from the top for audio",
    })
    fireEvent.pointerDown(target, {
      pointerId: 7,
      clientX: 100,
      clientY: 10,
    })
    fireEvent.pointerMove(target, {
      pointerId: 7,
      clientX: 100,
      clientY: 100,
    })
    fireEvent.pointerMove(target, {
      pointerId: 7,
      clientX: 100,
      clientY: 20,
    })
    fireEvent.pointerUp(target, {
      pointerId: 7,
      clientX: 100,
      clientY: 20,
    })
    expect(server.commands).toEqual([])
  })
})
