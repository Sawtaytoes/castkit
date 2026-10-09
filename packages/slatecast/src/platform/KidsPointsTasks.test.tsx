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
  delivery = "browser",
}: {
  value?: typeof data
  hasTouch?: boolean
  atMs?: number
  delivery?: "browser" | "image"
} = {}) => (
  <DisplayPropertiesContext.Provider
    value={{
      repaint: "instant",
      delivery,
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

test("a full child card opens task totals, individual scans, and returns through both levels", async () => {
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
    screen.getByText("30 min total · 1 scan"),
  ).toBeVisible()
  expect(screen.getByText("+80")).toBeVisible()
  expect(screen.getByText("+50")).toBeVisible()
  await userEvent.click(
    screen.getByRole("button", {
      name: "View Reading scans",
    }),
  )
  expect(
    screen.getByText("9:00a").parentElement,
  ).toHaveTextContent("9:00a · 30 min")
  expect(screen.getAllByText("+80")).toHaveLength(2)
  expect(screen.queryByText("+50")).toBeNull()
  expect(
    getComputedStyle(
      document.querySelector(".kids-points-tasks")!,
    ).animationName,
  ).toBe("kids-points-open-tasks")
  await userEvent.click(
    screen.getByRole("button", {
      name: "Back to today's tasks",
    }),
  )
  expect(
    screen.getByRole("button", {
      name: "View Feed the cat scans",
    }),
  ).toBeVisible()
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

test("image delivery groups practice and preserves zero-point scans and recorded totals", async () => {
  const value = {
    kids: [
      {
        ...data.kids[0]!,
        tasksToday: [
          {
            id: "piano-start",
            name: "Piano",
            atMs: now - 3600000,
            points: 0,
          },
          {
            id: "piano-first",
            name: "Piano",
            atMs: now - 1800000,
            points: 100,
            minutes: 15,
          },
          {
            id: "piano-second",
            name: "Piano",
            atMs: now - 600000,
            points: 0,
            minutes: 7.5,
          },
          {
            id: "reading",
            name: "Reading",
            atMs: now - 300000,
            points: 30,
            minutes: 10,
          },
          {
            id: "yesterday",
            name: "Piano",
            atMs: now - 86400000,
            points: 200,
            minutes: 60,
          },
        ],
      },
    ],
  }
  const view = render(drawing({ value, delivery: "image" }))
  await openKid("Robin")
  expect(screen.getByText("2 tasks")).toBeVisible()
  expect(
    screen.getAllByRole("heading", { name: "Piano" }),
  ).toHaveLength(1)
  expect(
    screen.getByText("22.5 min total · 3 scans"),
  ).toBeVisible()
  expect(screen.getByText("+100")).toBeVisible()
  await userEvent.click(
    screen.getByRole("button", {
      name: "View Piano scans",
    }),
  )
  expect(
    screen.queryByRole("heading", { name: "Reading" }),
  ).toBeNull()
  expect(screen.getAllByText("0")).toHaveLength(2)
  const list = screen.getByRole("region", {
    name: "Scroll Piano scans",
  })
  expect(
    Array.from(list.querySelectorAll("[data-task-id]")).map(
      (entry) => entry.getAttribute("data-task-id"),
    ),
  ).toEqual(["piano-second", "piano-first", "piano-start"])
  expect(list.querySelectorAll("time")).toHaveLength(3)
  expect(
    screen.getByText("9:50a").parentElement,
  ).toHaveTextContent("9:50a · 7.5 min")
  view.rerender(
    drawing({
      delivery: "image",
      value: {
        kids: value.kids.map((kid) => ({
          ...kid,
          tasksToday: kid.tasksToday.filter(
            (task) => task.id !== "piano-first",
          ),
        })),
      },
    }),
  )
  expect(
    screen.getByText("7.5 min total · 2 scans"),
  ).toBeVisible()
  expect(
    list.querySelector("[data-task-id='piano-first']"),
  ).toBeNull()
})

test("running practice appears once without adding elapsed time to its recorded total", async () => {
  render(
    drawing({
      value: {
        kids: [
          {
            ...data.kids[0]!,
            activeTask: {
              name: "Reading",
              startedAtMs: now - 600000,
              bankedMinutes: 30,
            },
          },
        ],
      },
    }),
  )
  await openKid("Robin")
  expect(
    screen.getAllByRole("heading", { name: "Reading" }),
  ).toHaveLength(1)
  expect(
    screen.getByText("30 min total · 1 scan"),
  ).toBeVisible()
  expect(
    screen.getByText("In progress since 9:50a"),
  ).toBeVisible()
  await userEvent.click(
    screen.getByRole("button", {
      name: "View Reading scans",
    }),
  )
  expect(
    screen.getByText("In progress since 9:50a"),
  ).toBeVisible()
  expect(screen.getByText("9:00a")).toBeVisible()
})

test("dragging a summary never opens the task, then a tap opens it", async () => {
  render(drawing())
  await openKid("Robin")
  const button = screen.getByRole("button", {
    name: "View Reading scans",
  })
  fireEvent.pointerDown(button, {
    pointerId: 1,
    clientX: 40,
    clientY: 140,
  })
  fireEvent.pointerMove(button, {
    pointerId: 1,
    clientX: 40,
    clientY: 80,
  })
  fireEvent.pointerUp(button, {
    pointerId: 1,
    clientX: 40,
    clientY: 80,
  })
  fireEvent.click(button)
  expect(
    screen.getByRole("heading", { name: "Today's tasks" }),
  ).toBeVisible()
  await userEvent.click(button)
  expect(
    screen.getByRole("region", {
      name: "Scroll Reading scans",
    }),
  ).toBeVisible()
})

test("negative awards reduce the task total and unavailable running history never invents zero totals", async () => {
  const view = render(
    drawing({
      value: {
        kids: [
          {
            ...data.kids[0]!,
            tasksToday: [
              ...(data.kids[0]?.tasksToday ?? []),
              {
                id: "deduction",
                name: "Reading",
                atMs: now,
                points: -20,
              },
            ],
          },
        ],
      },
    }),
  )
  await openKid("Robin")
  expect(screen.getByText("+60")).toBeVisible()
  expect(
    screen.getByText("30 min total · 2 scans"),
  ).toBeVisible()
  view.rerender(
    drawing({
      value: {
        kids: [
          {
            ...data.kids[0]!,
            tasksToday: undefined,
            activeTask: {
              name: "Reading",
              startedAtMs: now,
            },
          },
        ],
      },
    }),
  )
  expect(
    screen.getByText("Task history unavailable"),
  ).toBeVisible()
  expect(screen.queryByText("0")).toBeNull()
  await userEvent.click(
    screen.getByRole("button", {
      name: "View Reading scans",
    }),
  )
  expect(screen.getByText("—")).toBeVisible()
  expect(
    screen.getByText("In progress since 10:00a"),
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
