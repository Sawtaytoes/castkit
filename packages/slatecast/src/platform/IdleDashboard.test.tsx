import {
  render,
  screen,
  within,
} from "@testing-library/preact"
import { expect, onTestFinished, test } from "vitest"
import { IdleDashboard } from "./IdleDashboard.tsx"
import "../styles.css"
import "./platform.css"
import "./idleDashboard.css"

const now = Date.parse("2026-01-15T18:45:00Z")
const clock = {
  timeZone: "America/Chicago",
  isTwelveHour: true,
  isNumericDate: false,
}

test("keeps the clock useful before optional feeds arrive", () => {
  render(<IdleDashboard now={now} clock={clock} />)
  expect(screen.getByText("12:45")).toBeVisible()
  expect(
    screen.getByText("Nothing else scheduled"),
  ).toBeVisible()
  expect(
    screen.queryByRole("region", {
      name: "Today's points",
    }),
  ).toBeNull()
})

test("updates live totals in producer order and budgets only upcoming agenda rows", () => {
  const props = {
    now,
    clock,
    agenda: {
      events: [
        {
          summary: "Finished appointment",
          startMs: now - 7200000,
          isAllDay: false,
        },
        {
          summary: "Holiday",
          startMs: now - 43200000,
          isAllDay: true,
        },
        ...Array.from({ length: 5 }, (_, index) => ({
          summary: `Appointment ${index + 1}`,
          startMs: now + index * 3600000,
          isAllDay: false,
        })),
      ],
    },
    points: {
      kids: [
        {
          id: "sam",
          name: "Sam",
          pointsToday: 25,
          goal: 100,
          displayOrder: 1,
        },
        {
          id: "robin",
          name: "Robin",
          pointsToday: 80,
          goal: 100,
          displayOrder: 0,
        },
      ],
    },
  }
  const mounted = render(<IdleDashboard {...props} />)
  expect(
    screen.queryByText("Finished appointment"),
  ).toBeNull()
  expect(screen.getByText("Holiday")).toBeVisible()
  expect(screen.getByText("Appointment 2")).toBeVisible()
  expect(screen.queryByText("Appointment 3")).toBeNull()
  expect(
    screen
      .getAllByRole("article")
      .map((item) => item.getAttribute("aria-label")),
  ).toEqual(["Robin's points", "Sam's points"])
  mounted.rerender(
    <IdleDashboard
      {...props}
      points={{
        kids: [
          {
            id: "robin",
            name: "Robin",
            pointsToday: 120,
            goal: 100,
          },
        ],
      }}
    />,
  )
  expect(
    within(
      screen.getByRole("article", {
        name: "Robin's points",
      }),
    ).getByText("120"),
  ).toBeVisible()
  expect(screen.queryByText("Sam")).toBeNull()
  expect(
    screen.getByRole("progressbar", {
      name: "Robin's daily goal",
    }),
  ).toHaveValue(100)
})

test("fits every twelve-hour clock reading and three complete points cards on a 1024 by 600 panel", async () => {
  const { page } = await import("vitest/browser")
  const originalViewport = {
    width: window.innerWidth,
    height: window.innerHeight,
  }
  onTestFinished(() =>
    page.viewport(
      originalViewport.width,
      originalViewport.height,
    ),
  )
  await page.viewport(1024, 600)
  render(
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        fontFamily: "var(--font-sans)",
      }}
    >
      <IdleDashboard
        now={now}
        clock={clock}
        agenda={{
          events: [0, 1, 2].map((index) => ({
            summary:
              "A longer appointment description that wraps onto two lines",
            startMs: now + index * 3600000,
            isAllDay: false,
          })),
        }}
        points={{
          kids: ["Robin", "Sam", "Alex"].map((name) => ({
            id: name,
            name,
            pointsToday: 150,
            goal: 500,
            lastTask:
              "A long task description with plenty of words",
          })),
        }}
      />
    </div>,
  )
  await document.fonts.ready
  const time = screen.getByText("12:45")
  const reading = time.parentElement
  if (!reading)
    throw new Error("Clock reading was not mounted")
  expect(getComputedStyle(time).fontSize).toBe("210px")
  const original = time.textContent
  const overflow = Array.from(
    { length: 720 },
    (_, minute) =>
      `${Math.floor(minute / 60) + 1}:${String(minute % 60).padStart(2, "0")}`,
  ).filter((value) => {
    time.textContent = value
    return reading.scrollWidth > reading.clientWidth
  })
  time.textContent = original
  expect(overflow).toEqual([])
  expect(
    Array.from(
      document.querySelectorAll(
        ".idle-dashboard section, .idle-dashboard article, .idle-dashboard-agenda li",
      ),
    ).every((element) => {
      const bounds = element.getBoundingClientRect()
      return (
        bounds.left >= 0 &&
        bounds.right <= 1024 &&
        bounds.top >= 0 &&
        bounds.bottom <= 600
      )
    }),
  ).toBe(true)
})

test("keeps all dashboard sections inside the available window", async () => {
  render(
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
      }}
    >
      <IdleDashboard
        now={now}
        clock={clock}
        agenda={{
          events: [
            {
              summary: "An appointment",
              startMs: now,
              isAllDay: false,
            },
          ],
        }}
        points={{
          kids: ["Robin", "Sam", "Alex"].map((name) => ({
            id: name,
            name,
            pointsToday: 150,
            goal: 500,
          })),
        }}
      />
    </div>,
  )
  await document.fonts.ready
  expect(
    document.documentElement.scrollWidth,
  ).toBeLessThanOrEqual(window.innerWidth)
  expect(screen.getAllByRole("article")).toHaveLength(3)
  expect(
    Array.from(
      document.querySelectorAll(
        ".idle-dashboard section, .idle-dashboard article",
      ),
    ).every((element) => {
      const bounds = element.getBoundingClientRect()
      return (
        bounds.left >= 0 &&
        bounds.right <= window.innerWidth &&
        bounds.top >= 0 &&
        bounds.bottom <= window.innerHeight
      )
    }),
  ).toBe(true)
})
