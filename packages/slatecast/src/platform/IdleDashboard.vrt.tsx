import { render } from "@testing-library/preact"
import { inject, test } from "vitest"
import { page } from "vitest/browser"
import { CalendarFace } from "../views/Calendar.tsx"
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
const weather = {
  temperatureText: "72°",
  conditionText: "Sunny",
}
const agenda = {
  events: [
    "Library returns",
    "Swimming lessons",
    "Dinner with neighbors",
  ].map((summary, index) => ({
    summary,
    startMs: now + index * 3600000,
    isAllDay: false,
  })),
}
const points = {
  kids: [
    {
      id: "robin",
      name: "Robin",
      pointsToday: 570,
      goal: 500,
      color: "#2a9d50",
      lastTask: "Reading",
    },
    {
      id: "sam",
      name: "Sam",
      pointsToday: 15,
      goal: 500,
      color: "#8b5cb7",
      lastTask: "Putting away books",
    },
    {
      id: "alex",
      name: "Alex",
      pointsToday: 0,
      goal: 500,
      color: "#b96b35",
    },
  ],
}

test.each([
  "before",
  "after",
])("distance idle dashboard %s", async (mode) => {
  await page.viewport(1024, 600)
  document.documentElement.dataset.scheme = "dark"
  render(
    <div
      style={{
        width: "100vw",
        height: "100vh",
        fontFamily: "var(--font-sans)",
        display: "flex",
        background: "var(--bg)",
        color: "var(--fg)",
      }}
    >
      {mode === "before" ? (
        <CalendarFace
          currentMillis={now}
          clock={clock}
          weather={weather}
          agenda={agenda}
        />
      ) : (
        <IdleDashboard
          now={now}
          clock={clock}
          weather={weather}
          agenda={agenda}
          points={points}
        />
      )}
    </div>,
  )
  await document.fonts.ready
  await page.screenshot({
    path: `${inject("vrtActualDir")}/platform/idle-dashboard-${mode}.png`,
    element: document.body,
  })
})
