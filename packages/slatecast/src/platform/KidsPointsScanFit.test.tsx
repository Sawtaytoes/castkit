import type { ContractData } from "@castkit/sdk/contracts"
import { render, waitFor } from "@testing-library/preact"
import { expect, test } from "vitest"
import { DisplayPropertiesContext } from "./displayProperties.ts"
import { KidsPointsView } from "./KidsPointsView.tsx"
import "../styles.css"
import "./platform.css"

const now = Date.parse("2026-01-15T16:00:00Z")

// These are the view's own boxes, exercised inside all four browser windows.
test.each([
  [976, 254],
  [684, 200],
  [1280, 720],
  [320, 720],
])("scan feedback keeps a complete name, total and goal bar in a %i by %i board", async (width, height) => {
  const data: ContractData["kids-points.v1"] = {
    kids: [
      {
        id: "robin",
        name: "Robin",
        pointsToday: 500,
        goal: 500,
        lastTask: "Instrument Practice",
      },
      {
        id: "sky",
        name: "Sky",
        pointsToday: 75,
        goal: 500,
      },
      {
        id: "quinn",
        name: "Quinn",
        pointsToday: 200,
        goal: 500,
      },
    ],
    lastScan: {
      kidId: "robin",
      result: "awarded",
      points: 100,
      taskName: "Instrument Practice",
      atMs: now - 500,
    },
  }
  const { container } = render(
    <DisplayPropertiesContext.Provider
      value={{ delivery: "image", repaint: "fast" }}
    >
      <div style={{ width, height, display: "flex" }}>
        <KidsPointsView data={data} now={now} />
      </div>
    </DisplayPropertiesContext.Provider>,
  )
  await document.fonts.ready
  await waitFor(() => {
    expect(
      container.querySelectorAll(".kids-points-card"),
    ).toHaveLength(3)
  })
  const card = container.querySelector<HTMLElement>(
    '[data-scanned="true"]',
  )!
  const name = card.querySelector("h3")!
  const nameBounds = name.getBoundingClientRect()
  // Overflow:hidden must not let flex layout shrink the name to a sliver.
  expect(nameBounds.height).toBeGreaterThanOrEqual(
    Number.parseFloat(getComputedStyle(name).lineHeight) -
      1,
  )
  expect(name).toHaveTextContent("Robin")
  expect(
    card.querySelector(".kids-points-scan-headline"),
  ).toHaveTextContent("+100")
  expect(
    card.querySelector(".kids-points-scan-detail"),
  ).toHaveTextContent("Instrument Practice")
  expect(
    card.querySelector(".kids-points-total"),
  ).toHaveTextContent("500")
  const bar = card.querySelector('[role="progressbar"]')!
  expect(
    bar.getBoundingClientRect().height,
  ).toBeGreaterThanOrEqual(10)
  const bounds = card.getBoundingClientRect()
  card
    .querySelectorAll<HTMLElement>(
      "h3, .kids-points-scan, .kids-points-total, .kids-points-bar, .kids-points-goal-reached",
    )
    .forEach((part) => {
      const partBounds = part.getBoundingClientRect()
      expect(partBounds.top).toBeGreaterThanOrEqual(
        bounds.top,
      )
      expect(partBounds.bottom).toBeLessThanOrEqual(
        bounds.bottom,
      )
      expect(partBounds.right).toBeLessThanOrEqual(
        bounds.right,
      )
    })
  expect(
    card
      .querySelector(".kids-points-scan")
      ?.getBoundingClientRect().top,
  ).toBeGreaterThanOrEqual(nameBounds.bottom)
})
