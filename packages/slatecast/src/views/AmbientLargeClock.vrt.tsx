import { render } from "@testing-library/preact"
import { inject, test } from "vitest"
import { page } from "vitest/browser"
import { AmbientFace } from "./Ambient.tsx"
import { CalendarFace } from "./Calendar.tsx"
import "../styles.css"

// 12:45 PM in Chicago: the widest twelve-hour time.
const now = Date.parse("2026-01-15T18:45:00Z")

test.each([
  480, 720,
])("large ambient time at %s square", async (size) => {
  await page.viewport(size, size)
  document.documentElement.dataset.scheme = "dark"
  render(
    <div
      style={{
        fontFamily: "var(--font-sans)",
        // A grid stretches the face to the panel, as the device page does.
        display: "grid",
        width: "100vw",
        height: "100vh",
      }}
    >
      <AmbientFace
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
      />
    </div>,
  )
  await document.fonts.ready
  await page.screenshot({
    path: `${inject("vrtActualDir")}/views/ambient-large-clock-${size}x${size}.png`,
    element: document.body,
  })
})

test("an empty agenda draws the ambient face at 480 square", async () => {
  await page.viewport(480, 480)
  document.documentElement.dataset.scheme = "dark"
  render(
    <div
      style={{
        fontFamily: "var(--font-sans)",
        display: "grid",
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
        agenda={{ events: [] }}
      />
    </div>,
  )
  await document.fonts.ready
  await page.screenshot({
    path: `${inject("vrtActualDir")}/views/agenda-empty-480x480.png`,
    element: document.body,
  })
})
