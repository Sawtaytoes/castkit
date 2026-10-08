import { render, screen } from "@testing-library/preact"
import userEvent from "@testing-library/user-event"
import { expect, inject, test } from "vitest"
import { page } from "vitest/browser"
import { CalendarFace } from "../views/Calendar.tsx"
import { DisplayPropertiesContext } from "./displayProperties.ts"
import { KidsPointsView } from "./KidsPointsView.tsx"
import "../styles.css"
import "./platform.css"

const now = Date.parse("2026-01-15T18:45:00Z")
const capture = async (name: string) => {
  await document.fonts.ready
  await page.screenshot({
    path: `${inject("vrtActualDir")}/platform/${name}.png`,
    element: document.body,
  })
}

test.each([
  480, 720,
])("large agenda at %s square", async (size) => {
  await page.viewport(size, size)
  document.documentElement.dataset.scheme = "dark"
  render(
    <div
      style={{
        fontFamily: "var(--font-sans)",
        width: "100vw",
        height: "100vh",
      }}
    >
      <CalendarFace
        currentMillis={now}
        clock={{
          timeZone: "America/Chicago",
          isTwelveHour: true,
          isNumericDate: false,
        }}
        weather={{
          temperatureText: "72°",
          conditionText: "Sunny",
          condition: "sunny",
        }}
        agenda={{
          events: Array.from({ length: 8 }, (_, index) => ({
            summary: [
              "Swimming lessons",
              "Library returns",
              "Grocery delivery",
              "Book club",
              "Dinner with neighbors",
            ][index % 5]!,
            startMs: now + index * 3600000,
            isAllDay: false,
          })),
        }}
      />
    </div>,
  )
  await document.fonts.ready
  // Let the measured row budget settle after font loading.
  await new Promise((resolve) => setTimeout(resolve, 100))
  await capture(`agenda-large-clock-${size}x${size}`)
})

const mountKids = () => {
  document.documentElement.dataset.scheme = "dark"
  return render(
    <DisplayPropertiesContext.Provider
      value={{
        repaint: "instant",
        delivery: "browser",
        hasTouch: true,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-sans)",
          width: "100vw",
          height: "100vh",
          display: "flex",
        }}
      >
        <KidsPointsView
          now={now}
          settings={{
            isTotalsOnly: true,
            nameStyle: "initial",
          }}
          data={{
            kids: [
              {
                id: "robin",
                name: "Robin",
                pointsToday: 370,
                day: "2026-01-15",
                timeZone: "America/Chicago",
                tasksToday: Array.from(
                  { length: 12 },
                  (_, index) => ({
                    id: `task-${index}`,
                    name: [
                      "Reading",
                      "Practice piano",
                      "Feed the cat",
                      "Tidy bedroom",
                    ][index % 4]!,
                    atMs: now - (index + 1) * 600000,
                    points: 30,
                    minutes:
                      index % 2 === 0 ? 10 : undefined,
                  }),
                ),
              },
              {
                id: "sky",
                name: "Sky",
                pointsToday: 210,
                tasksToday: [],
              },
              {
                id: "quinn",
                name: "Quinn",
                pointsToday: 0,
                tasksToday: [],
              },
            ],
          }}
        />
      </div>
    </DisplayPropertiesContext.Provider>,
  )
}

test("daily tasks board", async () => {
  await page.viewport(480, 480)
  mountKids()
  await capture("kids-today-board-480x480")
})

test("daily tasks detail and scrolled entries", async () => {
  await page.viewport(480, 480)
  mountKids()
  await userEvent.click(
    screen.getByRole("button", {
      name: "View Robin's tasks today",
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
  await capture("kids-today-detail-480x480")
  const list = screen.getByRole("region", {
    name: "Scroll today's tasks",
  })
  list.scrollTop = list.scrollHeight
  await capture("kids-today-scrolled-480x480")
})
