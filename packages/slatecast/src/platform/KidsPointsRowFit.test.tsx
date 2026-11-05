import type { ContractData } from "@castkit/sdk/contracts"
import {
  render,
  screen,
  waitFor,
} from "@testing-library/preact"
import { expect, test } from "vitest"
import { DisplayPropertiesContext } from "./displayProperties.ts"
import { KidsPointsView } from "./KidsPointsView.tsx"
import {
  ALL_CHILDREN_FINISHING_ROW_HEIGHTS,
  type KidRowContent,
} from "./kidsPointsLayout.ts"
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

/** Every drawn element of the row, measured against the row's own box. */
const getRowOverflow = (row: Element | null) => {
  if (!row) {
    throw new Error("The view drew no row.")
  }
  const box = row.getBoundingClientRect()
  const parts = Array.from(row.querySelectorAll("*"))
    .filter((part) => !part.closest(".kids-points-open"))
    .map((part) => part.getBoundingClientRect())
    .filter((rect) => rect.height > 0)
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

const startedScan = (taskName: string) => ({
  kidId: "quinn",
  result: "started" as const,
  points: 0,
  taskName,
  atMs: now - 2_000,
})

const rowStates: {
  state: string
  content: KidRowContent
  drawnPart: string
  data: ContractData["kids-points.v1"]
}[] = [
  {
    state: "with a goal bar and an activity line",
    content: "goal",
    drawnPart: ".kids-points-footnote",
    data: {
      kids: [
        {
          ...quinn,
          activeTask: {
            name: "Reading",
            startedAtMs: now - 30 * 60_000,
          },
        },
        ...otherKids,
      ],
    },
  },
  {
    state: "showing a scan",
    content: "scan",
    drawnPart: ".kids-points-scan",
    data: {
      kids: [quinn, ...otherKids],
      lastScan: {
        kidId: "quinn",
        result: "awarded",
        points: 100,
        taskName: "Instrument Practice",
        atMs: now - 500,
      },
    },
  },
  {
    state: "running a timer from a reader",
    content: "timer",
    drawnPart: ".kids-points-countup",
    data: {
      kids: [
        {
          ...quinn,
          activeTask: {
            name: "Reading",
            startedAtMs: now - 30 * 60_000,
            reader: "Desk Reader",
          },
        },
        ...otherKids,
      ],
    },
  },
  {
    state: "running a timer from a started scan",
    content: "timer",
    drawnPart: ".kids-points-countup",
    data: {
      kids: [
        {
          ...quinn,
          activeTask: {
            name: "Reading",
            startedAtMs: now - 20 * 60_000,
          },
        },
        ...otherKids,
      ],
      lastScan: startedScan("Reading"),
    },
  },
  {
    state: "running a timer with banked minutes",
    content: "banked-timer",
    drawnPart: ".kids-points-countup-session",
    data: {
      kids: [
        {
          ...quinn,
          activeTask: {
            name: "Instrument Practice",
            startedAtMs: now - 30 * 60_000,
            bankedMinutes: 45,
            reader: "Desk Reader",
          },
        },
        ...otherKids,
      ],
    },
  },
  {
    state: "running a banked timer from a started scan",
    content: "banked-timer",
    drawnPart: ".kids-points-countup-session",
    data: {
      kids: [
        {
          ...quinn,
          activeTask: {
            name: "Instrument Practice",
            startedAtMs: now - 30 * 60_000,
            bankedMinutes: 45,
          },
        },
        ...otherKids,
      ],
      timerScans: [startedScan("Instrument Practice")],
      lastScan: startedScan("Instrument Practice"),
    },
  },
]

// The box holds the row's floor, the 12 px gap and the 28 px line.
test.each(
  rowStates,
)("a row $state still finishes when the overflow line squeezes it to its floor", async ({
  content,
  drawnPart,
  data,
}) => {
  const height =
    ALL_CHILDREN_FINISHING_ROW_HEIGHTS[content] + 40
  const { container } = renderInBox({
    width: 640,
    height,
    data,
  })
  await waitFor(() =>
    expect(
      container.querySelectorAll(".kids-points-row"),
    ).toHaveLength(1),
  )
  await document.fonts.ready
  const row = container.querySelector(".kids-points-row")
  expect(row?.querySelector(drawnPart)).not.toBeNull()
  expect(getRowOverflow(row)).toEqual({
    above: 0,
    below: 0,
  })
  expect(
    getBox(screen.getByText("2 more")).bottom,
  ).toBeLessThanOrEqual(
    getBox(container.querySelector(".kids-points")).bottom,
  )
})

// Banked minutes are left out: from 156 px the rule for rows beside the line draws that row anyway.
test.each(
  rowStates.filter(
    ({ content }) => content !== "banked-timer",
  ),
)("a box 1 px short of a row $state shows the count alone", async ({
  content,
  data,
}) => {
  const { container } = renderInBox({
    width: 640,
    height:
      ALL_CHILDREN_FINISHING_ROW_HEIGHTS[content] + 39,
    data,
  })
  await waitFor(() =>
    expect(screen.getByText("3 more")).toBeVisible(),
  )
  expect(
    container.querySelectorAll(".kids-points-row"),
  ).toHaveLength(0)
})

test("an only child's row takes the whole box, with no count", async () => {
  const { container } = renderInBox({
    width: 640,
    height: ALL_CHILDREN_FINISHING_ROW_HEIGHTS.goal,
    data: {
      kids: [
        {
          ...quinn,
          activeTask: {
            name: "Reading",
            startedAtMs: now - 30 * 60_000,
          },
        },
      ],
    },
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
  ).toEqual({ above: 0, below: 0 })
  expect(screen.queryByText(/more$/)).toBeNull()
})
