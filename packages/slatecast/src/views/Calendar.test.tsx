import { screen } from "@testing-library/preact"
import { describe, expect, test } from "vitest"
import {
  buildAgenda,
  buildAgendaEvent,
  buildSettings,
  buildSnapshot,
} from "../__fixtures__/buildSnapshot.ts"
import { mountSlatecast } from "../__tests__/setup/mountSlatecast.tsx"

const MINUTE_MILLIS = 60 * 1_000

/**
 * A fixed 24-hour UTC clock, so an event row's time cell is always "HH:MM"
 * whatever zone the test browser happens to run in.
 */
const UTC_CLOCK = {
  timeZone: "UTC",
  isTwelveHour: false,
  isNumericDate: false,
}

const mountCalendar = async (
  events: ReturnType<typeof buildAgenda>["events"],
) =>
  mountSlatecast({
    snapshot: buildSnapshot({
      view: "calendar",
      settings: buildSettings({ clock: UTC_CLOCK }),
      data: { agenda: { events } },
    }),
  })

const eventRows = () =>
  document.querySelectorAll(".calendar-event")

const eventTimes = () =>
  Array.from(
    document.querySelectorAll(".calendar-event-time"),
  ).map((cell) => cell.textContent)

describe("agenda rendering", () => {
  test("renders every pushed event with its start time", async () => {
    await mountCalendar(buildAgenda().events)

    expect(
      screen.getByText("Dentist appointment"),
    ).toBeVisible()
    expect(
      screen.getByText("Grocery delivery"),
    ).toBeVisible()
    eventTimes().forEach((time) => {
      expect(time).toMatch(/^\d{2}:\d{2}$/)
    })
  })

  test("shows the empty notice when the day has no events", async () => {
    await mountCalendar([])

    expect(
      screen.getByText("No upcoming events"),
    ).toBeVisible()
  })
})

describe("event budget", () => {
  test("truncates the list to the six-event budget", async () => {
    const summaries = [
      "First event",
      "Second event",
      "Third event",
      "Fourth event",
      "Fifth event",
      "Sixth event",
      "Seventh event",
      "Eighth event",
    ]

    await mountCalendar(
      summaries.map((summary, index) =>
        buildAgendaEvent({
          summary,
          startMs:
            Date.now() + (index + 1) * 10 * MINUTE_MILLIS,
        }),
      ),
    )

    expect(eventRows().length).toBe(6)
    expect(screen.getByText("Sixth event")).toBeVisible()
    expect(screen.queryByText("Seventh event")).toBeNull()
    expect(screen.queryByText("Eighth event")).toBeNull()
  })
})

describe("upcoming filter", () => {
  test("keeps an all-day event that started this morning", async () => {
    await mountCalendar([
      buildAgendaEvent({
        summary: "Recycling pickup",
        isAllDay: true,
        startMs: Date.now() - 12 * 60 * MINUTE_MILLIS,
      }),
      buildAgendaEvent(),
    ])

    expect(
      screen.getByText("Recycling pickup"),
    ).toBeVisible()
    expect(eventTimes()).toContain("All day")
  })

  test("drops a timed event that started before the grace window", async () => {
    // The grace window is one hour, so 90 minutes ago is gone and 30
    // minutes ago is still in progress.
    await mountCalendar([
      buildAgendaEvent({
        summary: "Morning standup",
        startMs: Date.now() - 90 * MINUTE_MILLIS,
      }),
      buildAgendaEvent({
        summary: "Design review",
        startMs: Date.now() - 30 * MINUTE_MILLIS,
      }),
    ])

    expect(screen.queryByText("Morning standup")).toBeNull()
    expect(screen.getByText("Design review")).toBeVisible()
    expect(eventRows().length).toBe(1)
  })
})
