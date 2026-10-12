import type { ContractData } from "@castkit/sdk/contracts"
import { render, waitFor } from "@testing-library/preact"
import { expect, test } from "vitest"
import { DisplayPropertiesContext } from "./displayProperties.ts"
import { KidsPointsView } from "./KidsPointsView.tsx"
import "../styles.css"
import "./platform.css"

const now = Date.parse("2026-01-15T16:00:00Z")
const kids: ContractData["kids-points.v1"]["kids"] = [
  {
    id: "robin",
    name: "Robin",
    pointsToday: 130,
    goal: 400,
    activeTask: {
      name: "Piano",
      startedAtMs: now - 11 * 60_000,
      bankedMinutes: 30,
      isCountdown: false,
      reader: "Practice Reader",
    },
  },
  { id: "sky", name: "Sky", pointsToday: 85, goal: 400 },
  {
    id: "quinn",
    name: "Quinn",
    pointsToday: 100,
    goal: 400,
  },
]

// Exercise the view's measured card sizes inside each of the four browser windows.
test.each([
  [976, 254],
  [684, 200],
  [1200, 600],
  [320, 720],
])("earned points stay visible during a count-up in a %i by %i board", async (width, height) => {
  const content = (pointsToday: number, time: number) => (
    <DisplayPropertiesContext.Provider
      value={{ delivery: "browser", repaint: "instant" }}
    >
      <div style={{ width, height, display: "flex" }}>
        <KidsPointsView
          data={{
            kids: kids.map((kid, index) =>
              index === 0 ? { ...kid, pointsToday } : kid,
            ),
          }}
          now={time}
        />
      </div>
    </DisplayPropertiesContext.Provider>
  )
  const { container, rerender } = render(content(130, now))
  await document.fonts.ready
  await waitFor(() => {
    expect(
      container.querySelectorAll(".kids-points-card"),
    ).toHaveLength(3)
  })
  const card = container.querySelector(".kids-points-card")!
  const total = card.querySelector(
    ".kids-points-activity-total, .kids-points-total",
  )!
  expect(total).toHaveTextContent("130")
  expect(
    card.querySelector(".kids-points-countup-total"),
  ).toHaveTextContent("41min total")
  expect(
    card.querySelector(".kids-points-countup-session"),
  ).toHaveTextContent("11 min this session")
  const box = card.getBoundingClientRect()
  card
    .querySelectorAll("h3, p, strong, span")
    .forEach((part) => {
      const bounds = part.getBoundingClientRect()
      expect(bounds.top).toBeGreaterThanOrEqual(box.top)
      expect(bounds.bottom).toBeLessThanOrEqual(box.bottom)
      expect(bounds.right).toBeLessThanOrEqual(box.right)
    })
  rerender(content(1230, now + 2 * 60_000))
  expect(total).toHaveTextContent("1,230")
  expect(
    card.querySelector(".kids-points-countup-total"),
  ).toHaveTextContent("43min total")
  expect(
    card.querySelector(".kids-points-countup-session"),
  ).toHaveTextContent("13 min this session")
})
