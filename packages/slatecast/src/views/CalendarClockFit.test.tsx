import { render, screen } from "@testing-library/preact"
import { expect, test } from "vitest"
import { page } from "vitest/browser"
import { CalendarFace } from "./Calendar.tsx"
import "../styles.css"

const currentMillis = Date.parse("2026-01-15T18:45:00Z")
const agenda = {
  events: Array.from({ length: 8 }, (_, index) => ({
    summary: `Event ${index + 1}`,
    startMs: currentMillis + index * 3600000,
    isAllDay: false,
  })),
}
const mountFace = () =>
  render(
    <div
      style={{
        fontFamily: "var(--font-sans)",
        width: "100vw",
        height: "100vh",
      }}
    >
      <CalendarFace
        currentMillis={currentMillis}
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
        agenda={agenda}
      />
    </div>,
  )

test.each([
  { width: 480, height: 480, fontSize: 120 },
  { width: 720, height: 720, fontSize: 180 },
  { width: 1280, height: 720, fontSize: 180 },
])("agenda's large clock fits complete rows at $width by $height", async ({
  width,
  height,
  fontSize,
}) => {
  await page.viewport(width, height)
  mountFace()
  await document.fonts.ready
  const clock = document.querySelector(".calendar-time")!
  expect(
    Number.parseFloat(getComputedStyle(clock).fontSize),
  ).toBe(fontSize)
  expect(screen.getByText("12:45")).toBeVisible()
  expect(screen.getByText("p")).toBeVisible()
  await expect
    .poll(() =>
      Array.from(
        document.querySelectorAll(".calendar-event"),
      ).every(
        (row) =>
          row.getBoundingClientRect().bottom <=
          height - height * 0.05 + 1,
      ),
    )
    .toBe(true)
  expect(
    document.querySelectorAll(".calendar-event").length,
  ).toBeGreaterThanOrEqual(4)
  expect(
    document.querySelector(".calendar-clock")?.scrollWidth,
  ).toBeLessThanOrEqual(width * 0.9)
})

test("the short landscape agenda keeps its existing 44px time and five-row budget", async () => {
  await page.viewport(480, 320)
  mountFace()
  expect(
    getComputedStyle(
      document.querySelector(".calendar-time")!,
    ).fontSize,
  ).toBe("44px")
  await expect
    .poll(
      () =>
        document.querySelectorAll(".calendar-event").length,
    )
    .toBe(5)
})
