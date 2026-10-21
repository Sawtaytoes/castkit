import {
  render,
  screen,
  within,
} from "@testing-library/preact"
import userEvent from "@testing-library/user-event"
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

test("opens a child's tasks locally and returns to the overview", async () => {
  render(
    <IdleDashboard
      now={now}
      clock={clock}
      points={{
        kids: [
          {
            id: "robin",
            name: "Robin",
            pointsToday: 80,
            tasksToday: [
              {
                id: "task",
                name: "Reading",
                points: 80,
                atMs: now,
              },
            ],
          },
        ],
      }}
    />,
  )
  const card = screen.getByRole("article", {
    name: "Robin's points",
  })
  const opener = screen.getByRole("button", {
    name: "View Robin's tasks today",
  })
  expect(
    Math.abs(
      opener.getBoundingClientRect().width -
        card.clientWidth,
    ),
  ).toBeLessThan(1)
  await userEvent.setup().click(opener)
  expect(screen.getByText("Today's tasks")).toBeVisible()
  expect(screen.getByText("Reading")).toBeVisible()
  expect(
    screen.queryByRole("region", {
      name: "Time and weather",
    }),
  ).toBeNull()
  await userEvent.setup().click(
    screen.getByRole("button", {
      name: "Back to all children",
    }),
  )
  expect(
    screen.getByRole("region", {
      name: "Time and weather",
    }),
  ).toBeVisible()
})

test("matches the standalone clock font and draws an inline weather icon and condition", async () => {
  const { page } = await import("vitest/browser")
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
        weather={{
          temperatureText: "62°",
          conditionText: "Partly cloudy",
          condition: "partlycloudy",
        }}
      />
    </div>,
  )
  const temperature = screen
    .getByText("62°")
    .getBoundingClientRect()
  const condition = screen
    .getByText("Partly cloudy")
    .getBoundingClientRect()
  expect(
    document.querySelector(".idle-dashboard-weather svg"),
  ).toBeVisible()
  expect(condition.left).toBeGreaterThan(temperature.right)
  expect(
    Math.abs(
      (condition.top + condition.bottom) / 2 -
        (temperature.top + temperature.bottom) / 2,
    ),
  ).toBeLessThan(2)
  expect(
    getComputedStyle(screen.getByText("12:45")).fontFamily,
  ).not.toContain("Baloo")
})

test.each([
  "dark",
  "light",
])("high contrast %s uses distinct text and surfaces without recoloring identity", (scheme) => {
  const root = document.documentElement
  const previous = {
    scheme: root.dataset.scheme,
    contrast: root.dataset.contrast,
  }
  onTestFinished(() => {
    if (previous.scheme)
      root.dataset.scheme = previous.scheme
    else delete root.dataset.scheme
    if (previous.contrast)
      root.dataset.contrast = previous.contrast
    else delete root.dataset.contrast
  })
  root.dataset.scheme = scheme
  root.dataset.contrast = "high"
  const { container } = render(
    <IdleDashboard
      now={now}
      clock={clock}
      points={{
        kids: [
          {
            id: "sample",
            name: "Robin",
            pointsToday: 10,
            goal: 500,
            color: "#2a9d50",
          },
        ],
      }}
    />,
  )
  const card = container.querySelector(
    ".idle-dashboard-clock",
  )
  const kid = container.querySelector(
    ".idle-dashboard-points article",
  )
  if (!card || !kid)
    throw new Error("Missing dashboard card")
  expect(getComputedStyle(card).backgroundColor).toBe(
    scheme === "dark"
      ? "rgb(0, 0, 0)"
      : "rgb(255, 255, 255)",
  )
  expect(getComputedStyle(kid).borderTopColor).toBe(
    "rgb(42, 157, 80)",
  )
  root.dataset.contrast = "standard"
  expect(getComputedStyle(card).backgroundColor).not.toBe(
    scheme === "dark"
      ? "rgb(0, 0, 0)"
      : "rgb(255, 255, 255)",
  )
})

test.each([
  "dark",
  "light",
])("darker contrast %s preserves text and identity while switching surfaces live", (scheme) => {
  const root = document.documentElement
  const previous = {
    scheme: root.dataset.scheme,
    contrast: root.dataset.contrast,
  }
  onTestFinished(() => {
    if (previous.scheme)
      root.dataset.scheme = previous.scheme
    else delete root.dataset.scheme
    if (previous.contrast)
      root.dataset.contrast = previous.contrast
    else delete root.dataset.contrast
  })
  root.dataset.scheme = scheme
  root.dataset.contrast = "standard"
  const { container } = render(
    <main className="platform">
      <section
        className="platform-panel"
        style={{
          "--bg": "#131822",
          "--surface": "#1e2633",
        }}
      >
        <IdleDashboard
          now={now}
          clock={clock}
          points={{
            kids: [
              {
                id: "sample",
                name: "Robin",
                pointsToday: 10,
                goal: 500,
                color: "#2a9d50",
              },
            ],
          }}
        />
      </section>
    </main>,
  )
  const clockCard = container.querySelector(
    ".idle-dashboard-clock",
  )
  const kid = container.querySelector(
    ".idle-dashboard-points article",
  )
  if (!clockCard || !kid)
    throw new Error("Missing dashboard card")
  const standard = {
    background: getComputedStyle(clockCard).backgroundColor,
    surface: getComputedStyle(kid).backgroundColor,
    foreground: getComputedStyle(kid).color,
  }
  root.dataset.contrast = "high"
  root.dataset.contrast = "darker"
  expect(getComputedStyle(clockCard).backgroundColor).toBe(
    scheme === "dark"
      ? "rgb(13, 17, 24)"
      : standard.background,
  )
  expect(getComputedStyle(kid).backgroundColor).toBe(
    scheme === "dark"
      ? "rgb(23, 29, 39)"
      : standard.surface,
  )
  expect(getComputedStyle(kid).color).toBe(
    standard.foreground,
  )
  expect(getComputedStyle(kid).borderTopColor).toBe(
    "rgb(42, 157, 80)",
  )
  expect(getComputedStyle(kid).outlineStyle).toBe("none")
  root.dataset.contrast = "standard"
  expect(getComputedStyle(clockCard).backgroundColor).toBe(
    standard.background,
  )
  expect(getComputedStyle(kid).backgroundColor).toBe(
    standard.surface,
  )
})
