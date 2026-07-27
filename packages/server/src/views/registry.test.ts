import {
  IMPRESSION_DEVICE,
  PHAT_DEVICE,
} from "@castkit/core/devices/device"
import type { ReactElement } from "react"
import { describe, expect, test } from "vitest"
import type { AgendaData } from "../state/viewDataStore.ts"
import {
  type ClockConfig,
  getIsAgendaView,
  getIsClockBearingView,
  renderViewElement,
} from "./registry.ts"

/** A Chicago 12-hour, long-date clock config (the shipped defaults). */
const CHICAGO_CLOCK: ClockConfig = {
  timeZone: "America/Chicago",
  isTwelveHour: true,
  isNumericDate: false,
}

/** Read the `events` prop the agenda view was handed. */
const getEventSummaries = (element: ReactElement) =>
  (
    element.props as {
      events: readonly { summary: string }[]
    }
  ).events.map((event) => event.summary)

/** Read the `time`/`date` props a clock view was handed. */
const getClockText = (element: ReactElement) =>
  element.props as { time: string; date: string }

describe("renderViewElement — Clock (Agenda)", () => {
  const now = new Date("2026-07-03T22:00:00-05:00")
  const agenda: AgendaData = {
    events: [
      {
        startMs: Date.parse("2026-07-03T00:00:00-05:00"),
        summary: "All-day thing",
        isAllDay: true,
      },
      {
        startMs: Date.parse("2026-07-03T17:00:00-05:00"),
        summary: "Past meeting",
        isAllDay: false,
      },
      {
        startMs: Date.parse("2026-07-03T23:30:00-05:00"),
        summary: "Later tonight",
        isAllDay: false,
      },
    ],
  }

  test("keeps all-day + future events, drops started timed events", () => {
    const element = renderViewElement({
      viewName: "Clock (Agenda)",
      device: PHAT_DEVICE,
      now,
      clock: CHICAGO_CLOCK,
      agenda,
    })
    expect(getEventSummaries(element)).toEqual([
      "All-day thing",
      "Later tonight",
    ])
  })

  test("the clockless Agenda view selects the same events", () => {
    const element = renderViewElement({
      viewName: "Agenda",
      device: IMPRESSION_DEVICE,
      now,
      clock: CHICAGO_CLOCK,
      agenda,
    })
    expect(getEventSummaries(element)).toEqual([
      "All-day thing",
      "Later tonight",
    ])
  })

  test("the Agenda view is handed a date but never a time", () => {
    const props = renderViewElement({
      viewName: "Agenda",
      device: IMPRESSION_DEVICE,
      now,
      clock: CHICAGO_CLOCK,
      agenda,
    }).props as { date: string; time?: string }
    // A time prop would have to be re-rendered every minute — the whole reason
    // this view exists is that it does not.
    expect(props.time).toBeUndefined()
    expect(props.date).toBe("Friday, July 3")
  })

  test("the Agenda view falls back to its empty text with nothing left today", () => {
    const props = renderViewElement({
      viewName: "Agenda",
      device: IMPRESSION_DEVICE,
      now,
      clock: CHICAGO_CLOCK,
      agenda: { events: [] },
    }).props as {
      events: readonly unknown[]
      emptyText: string
    }
    expect(props.events).toEqual([])
    expect(props.emptyText).toBe("Nothing else today")
  })
})

describe("agenda + clock-bearing view classification", () => {
  test("Agenda renders agenda data without joining the minute tick", () => {
    expect(getIsAgendaView("Agenda")).toBe(true)
    expect(getIsClockBearingView("Agenda")).toBe(false)
  })

  test("Clock (Agenda) is both an agenda view and clock-bearing", () => {
    expect(getIsAgendaView("Clock (Agenda)")).toBe(true)
    expect(getIsClockBearingView("Clock (Agenda)")).toBe(
      true,
    )
  })

  test("a photo view is neither", () => {
    expect(getIsAgendaView("Photo Frame")).toBe(false)
    expect(getIsClockBearingView("Photo Frame")).toBe(false)
  })
})

describe("renderViewElement — clock config", () => {
  // 2026-07-03 22:00 Chicago (CDT, -05:00) — a Friday.
  const now = new Date("2026-07-03T22:00:00-05:00")

  test("12-hour + long date on the large Clock view", () => {
    const { time, date } = getClockText(
      renderViewElement({
        viewName: "Clock",
        device: IMPRESSION_DEVICE,
        now,
        clock: CHICAGO_CLOCK,
      }),
    )
    expect(time).toBe("10:00 PM")
    expect(date).toBe("Friday, July 3")
  })

  test("24-hour + numeric date honour the resolved config", () => {
    const { time, date } = getClockText(
      renderViewElement({
        viewName: "Clock",
        device: IMPRESSION_DEVICE,
        now,
        clock: {
          timeZone: "America/Chicago",
          isTwelveHour: false,
          isNumericDate: true,
        },
      }),
    )
    expect(time).toBe("22:00")
    expect(date).toBe("7/3/2026")
  })

  test("the timezone shifts the rendered wall-clock time", () => {
    const { time } = getClockText(
      renderViewElement({
        viewName: "Clock",
        device: IMPRESSION_DEVICE,
        now,
        clock: {
          timeZone: "America/New_York",
          isTwelveHour: true,
          isNumericDate: false,
        },
      }),
    )
    // 22:00 Chicago is 23:00 in New York.
    expect(time).toBe("11:00 PM")
  })
})
