import type { ContractData } from "@castkit/sdk/contracts"
import {
  fireEvent,
  render,
  screen,
} from "@testing-library/preact"
import userEvent from "@testing-library/user-event"
import { expect, test } from "vitest"
import { page } from "vitest/browser"
import { DisplayPropertiesContext } from "./displayProperties.ts"
import { KidsPointsView } from "./KidsPointsView.tsx"
import "../styles.css"
import "./platform.css"

const now = Date.parse("2026-01-15T16:00:00Z")
const data: ContractData["kids-points.v1"] = {
  kids: [
    {
      id: "robin",
      name: "Robin",
      pointsToday: 130,
      day: "2026-01-15",
      timeZone: "America/Chicago",
      tasksToday: [
        {
          id: "first",
          name: "Reading",
          atMs: now - 3600000,
          points: 80,
          minutes: 30,
        },
        {
          id: "second",
          name: "Feed the cat",
          atMs: now - 1800000,
          points: 50,
        },
      ],
    },
    {
      id: "sky",
      name: "Sky",
      pointsToday: 0,
      day: "2026-01-15",
      timeZone: "America/Chicago",
      tasksToday: [],
    },
  ],
}
const drawing = ({
  value = data,
  hasTouch = true,
  atMs = now,
}: {
  value?: typeof data
  hasTouch?: boolean
  atMs?: number
} = {}) => (
  <DisplayPropertiesContext.Provider
    value={{
      repaint: "instant",
      delivery: "browser",
      hasTouch,
    }}
  >
    <div
      class="platform"
      style={{
        width: "min(480px, 100vw)",
        height: "480px",
        display: "flex",
      }}
    >
      <KidsPointsView data={value} now={atMs} />
    </div>
  </DisplayPropertiesContext.Provider>
)

const openKid = async (name: string) => {
  await userEvent.click(
    screen.getByRole("button", {
      name: `View ${name}'s tasks today`,
    }),
  )
  await expect
    .poll(
      () =>
        getComputedStyle(
          document.querySelector(".kids-points-tasks")!,
        ).opacity,
    )
    .toBe("1")
}

test("a full child card opens its latest daily tasks and returns to the whole board", async () => {
  document.documentElement.dataset.repaint = "instant"
  render(drawing())
  expect(
    getComputedStyle(
      screen.getByRole("button", {
        name: "View Robin's tasks today",
      }),
    ).backgroundColor,
  ).toBe("rgba(0, 0, 0, 0)")
  await openKid("Robin")
  expect(
    screen.getByRole("heading", { name: "Today's tasks" }),
  ).toBeVisible()
  expect(
    screen.getByRole("heading", { name: "Reading" }),
  ).toBeVisible()
  expect(
    screen.getByText("9:00a").parentElement,
  ).toHaveTextContent("9:00a · 30 min")
  expect(screen.getByText("+80")).toBeVisible()
  expect(screen.getByText("+50")).toBeVisible()
  expect(
    getComputedStyle(
      document.querySelector(".kids-points-tasks")!,
    ).animationName,
  ).toBe("kids-points-open-tasks")
  await userEvent.click(
    screen.getByRole("button", {
      name: "Back to all children",
    }),
  )
  expect(
    screen.getByRole("button", {
      name: "View Sky's tasks today",
    }),
  ).toBeVisible()
})

test("a corrected retained snapshot removes a reversed award from an open detail", async () => {
  const view = render(drawing())
  await openKid("Robin")
  view.rerender(
    drawing({
      value: {
        kids: data.kids.map((kid) =>
          kid.id === "robin"
            ? {
                ...kid,
                pointsToday: 50,
                tasksToday: kid.tasksToday?.filter(
                  (task) => task.id !== "first",
                ),
              }
            : kid,
        ),
      },
    }),
  )
  expect(
    screen.queryByRole("heading", { name: "Reading" }),
  ).toBeNull()
  expect(
    screen.getByRole("heading", { name: "Feed the cat" }),
  ).toBeVisible()
})

test("task overflow scrolls to later entries without clipping the fixed header", async () => {
  await page.viewport(480, 480)
  render(
    drawing({
      value: {
        kids: [
          {
            ...data.kids[0]!,
            tasksToday: Array.from(
              { length: 20 },
              (_, index) => ({
                id: String(index),
                name: `Task ${index + 1}`,
                atMs: now - index * 60000,
                points: 10,
              }),
            ),
          },
        ],
      },
    }),
  )
  await openKid("Robin")
  const list = screen.getByRole("region", {
    name: "Scroll today's tasks",
  })
  const last = screen.getByRole("heading", {
    name: "Task 20",
  })
  expect(list.scrollHeight).toBeGreaterThan(
    list.clientHeight,
  )
  expect(last.getBoundingClientRect().top).toBeGreaterThan(
    list.getBoundingClientRect().bottom,
  )
  list.scrollTop = list.scrollHeight
  expect(
    last.getBoundingClientRect().bottom,
  ).toBeLessThanOrEqual(list.getBoundingClientRect().bottom)
  expect(
    screen
      .getByRole("button", { name: "Back to all children" })
      .getBoundingClientRect().top,
  ).toBeGreaterThanOrEqual(0)
  expect(list.scrollWidth).toBeLessThanOrEqual(
    list.clientWidth,
  )
})

test("touchless panels keep the board passive", () => {
  render(drawing({ hasTouch: false }))
  expect(
    screen.queryByRole("button", { name: /tasks today/ }),
  ).toBeNull()
  expect(
    screen.getByRole("heading", { name: "Robin" }),
  ).toBeVisible()
})

test("dragging over a child never opens its detail", () => {
  render(drawing())
  const button = screen.getByRole("button", {
    name: "View Robin's tasks today",
  })
  fireEvent.pointerDown(button, {
    clientX: 40,
    clientY: 40,
  })
  fireEvent.pointerMove(button, {
    clientX: 40,
    clientY: 110,
  })
  fireEvent.pointerUp(button, { clientX: 40, clientY: 110 })
  fireEvent.click(button)
  expect(
    screen.queryByRole("heading", {
      name: "Today's tasks",
    }),
  ).toBeNull()
})

test("an empty day, unavailable history, and yesterday's snapshot have distinct states", async () => {
  const view = render(drawing())
  await openKid("Sky")
  expect(
    screen.getByText("No tasks scanned today"),
  ).toBeVisible()
  view.rerender(drawing({ atMs: now + 86400000 }))
  expect(
    screen.getByText("Waiting for today's tasks"),
  ).toBeVisible()
  view.rerender(
    drawing({
      value: {
        kids: [{ id: "sky", name: "Sky", pointsToday: 0 }],
      },
    }),
  )
  expect(
    screen.getByText("Task history unavailable"),
  ).toBeVisible()
})
