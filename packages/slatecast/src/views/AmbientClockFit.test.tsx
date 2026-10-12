import { render } from "@testing-library/preact"
import { expect, test } from "vitest"
import { page } from "vitest/browser"
import { AmbientFace } from "./Ambient.tsx"
import { ClockFace } from "./Clock.tsx"
import "../styles.css"

// 12:45 PM in Chicago: the widest twelve-hour time.
const currentMillis = Date.parse("2026-01-15T18:45:00Z")
const clock = {
  timeZone: "America/Chicago",
  isTwelveHour: true,
  isNumericDate: false,
}
const frame = {
  fontFamily: "var(--font-sans)",
  width: "100vw",
  height: "100vh",
}

test.each([
  { width: 480, height: 480, fontSize: 120 },
  { width: 720, height: 720, fontSize: 180 },
])("the ambient time takes the agenda's distance size at $width by $height", async ({
  width,
  height,
  fontSize,
}) => {
  await page.viewport(width, height)
  render(
    <div style={frame}>
      <AmbientFace
        currentMillis={currentMillis}
        clock={clock}
        weather={{
          temperatureText: "-12°",
          conditionText: "Thunderstorms",
          condition: "sunny",
        }}
      />
    </div>,
  )
  await document.fonts.ready
  const time = document.querySelector(".ambient-time")!
  expect(time.textContent).toBe("12:45p")
  expect(
    Number.parseFloat(getComputedStyle(time).fontSize),
  ).toBe(fontSize)
  const range = document.createRange()
  range.selectNodeContents(time)
  expect(
    range.getBoundingClientRect().width,
  ).toBeLessThanOrEqual(width * 0.9)
  expect(
    document
      .querySelector(".ambient")!
      .getBoundingClientRect().bottom,
  ).toBeLessThanOrEqual(height)
})

test("the clock view's time takes the same size at 480 by 480", async () => {
  await page.viewport(480, 480)
  render(
    <div style={frame}>
      <ClockFace
        currentMillis={currentMillis}
        clock={clock}
      />
    </div>,
  )
  expect(
    getComputedStyle(
      document.querySelector(".ambient-time")!,
    ).fontSize,
  ).toBe("120px")
})

test("an ambient panel in a shared platform grid keeps 17vmin", async () => {
  await page.viewport(1280, 720)
  render(
    <div class="platform-layout" data-layout="grid">
      <AmbientFace
        currentMillis={currentMillis}
        clock={clock}
        weather={null}
      />
    </div>,
  )
  expect(
    getComputedStyle(
      document.querySelector(".ambient-time")!,
    ).fontSize,
  ).toBe("122.4px")
})
