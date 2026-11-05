import type { ContractData } from "@castkit/sdk/contracts"
import {
  render,
  screen,
  waitFor,
} from "@testing-library/preact"
import { expect, test } from "vitest"
import { DisplayPropertiesContext } from "./displayProperties.ts"
import { KidsPointsView } from "./KidsPointsView.tsx"
import "../styles.css"
import "./platform.css"

const now = Date.parse("2026-01-15T16:00:00Z")

type KidEntry =
  ContractData["kids-points.v1"]["kids"][number]

const quinn: KidEntry = {
  id: "quinn",
  name: "Quinn",
  color: "#E07A5F",
  pointsToday: 100,
  goal: 400,
}

const otherKids: KidEntry[] = [
  {
    id: "robin",
    name: "Robin",
    color: "#81B29A",
    pointsToday: 130,
    goal: 500,
  },
  {
    id: "sky",
    name: "Sky",
    color: "#F2CC8F",
    pointsToday: 520,
    goal: 500,
  },
]

const renderInBox = ({
  width,
  height,
  data,
}: {
  width: number
  height: number
  data: ContractData["kids-points.v1"]
}) =>
  render(
    <DisplayPropertiesContext.Provider
      value={{ delivery: "browser", repaint: "instant" }}
    >
      <div
        style={{
          width,
          height,
          display: "flex",
          fontFamily: "var(--font-sans)",
        }}
      >
        <KidsPointsView
          data={data}
          now={now}
          settings={{
            isAllChildrenVisible: true,
            scanSeconds: 30,
          }}
        />
      </div>
    </DisplayPropertiesContext.Provider>,
  )

const getBox = (element: Element | null) => {
  if (!element) {
    throw new Error("The view did not draw the element.")
  }
  return element.getBoundingClientRect()
}

/** Every drawn part of the row, measured against the row's own box. */
const getRowOverflow = (row: Element | null) => {
  if (!row) {
    throw new Error("The view drew no row.")
  }
  const box = row.getBoundingClientRect()
  const parts = Array.from(
    row.querySelectorAll(
      ":scope > :not(.kids-points-open), .kids-points-row-head *",
    ),
  ).map((part) => part.getBoundingClientRect())
  return {
    above: Math.max(
      0,
      box.top - Math.min(...parts.map((part) => part.top)),
    ),
    below: Math.max(
      0,
      Math.max(...parts.map((part) => part.bottom)) -
        box.bottom,
    ),
  }
}

test("the 1024 x 600 desk at 1.5x zoom draws a child above the overflow line", async () => {
  const { container } = renderInBox({
    width: 659,
    height: 154,
    data: { kids: [quinn, ...otherKids] },
  })
  await waitFor(() =>
    expect(
      screen.getByRole("heading", { name: "Quinn" }),
    ).toBeVisible(),
  )
  expect(
    container.querySelectorAll(".kids-points-row"),
  ).toHaveLength(1)
  expect(screen.getByText("2 more")).toBeVisible()
})

// A box of 140 px is the smallest in which a row and the overflow line both finish.
test.each([
  { state: "idle", first: quinn },
  {
    state: "running a timer",
    first: {
      ...quinn,
      activeTask: {
        name: "Reading",
        startedAtMs: now - 30 * 60_000,
      },
    },
  },
  {
    state: "showing a scan",
    first: quinn,
    lastScan: {
      kidId: "quinn",
      result: "awarded" as const,
      points: 100,
      taskName: "Instrument Practice",
      atMs: now - 500,
    },
  },
])("a row $state still finishes when the overflow line squeezes it", async ({
  first,
  lastScan,
}) => {
  const { container } = renderInBox({
    width: 640,
    height: 140,
    data: { kids: [first, ...otherKids], lastScan },
  })
  await waitFor(() =>
    expect(
      container.querySelectorAll(".kids-points-row"),
    ).toHaveLength(1),
  )
  await document.fonts.ready
  expect(
    getRowOverflow(
      container.querySelector(".kids-points-row"),
    ),
  ).toEqual({
    above: 0,
    below: 0,
  })
  expect(
    getBox(screen.getByText("2 more")).bottom,
  ).toBeLessThanOrEqual(
    getBox(container.querySelector(".kids-points")).bottom,
  )
})
