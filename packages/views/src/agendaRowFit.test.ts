import { isValidElement, type ReactNode } from "react"
import { describe, expect, test } from "vitest"
import { AgendaView } from "./AgendaView.tsx"
import {
  type ClockAgendaEvent,
  ClockAgendaView,
} from "./ClockAgendaView.tsx"
import { countRowsThatFit } from "./viewStyles.ts"

/**
 * A view is a pure function of its props, so these call it directly and read
 * the element tree it returns. What they guard is the one thing a panel cannot
 * recover from: a row the layout starts and the glass edge cuts in half. The
 * counts below are not arbitrary — they are what each real panel holds, so a
 * font or gap change that quietly costs a row fails here instead of on a wall.
 */

/** Every string in the returned tree, in document order. */
const collectText = (
  node: ReactNode,
): readonly string[] => {
  if (typeof node === "string") {
    return [node]
  }
  if (Array.isArray(node)) {
    return node.flatMap(collectText)
  }
  if (isValidElement(node)) {
    return collectText(
      (node.props as { children?: ReactNode }).children,
    )
  }
  return []
}

/** The event summaries a view actually drew. */
const getDrawnSummaries = ({
  node,
  events,
}: {
  node: ReactNode
  events: readonly ClockAgendaEvent[]
}) => {
  const drawnText = new Set(collectText(node))
  return events
    .map((event) => event.summary)
    .filter((summary) => drawnText.has(summary))
}

const EVENTS: readonly ClockAgendaEvent[] = [
  { timeText: "12:00 PM", summary: "First" },
  { timeText: "12:40 PM", summary: "Second" },
  { timeText: "1:45 PM", summary: "Third" },
  { timeText: "3:15 PM", summary: "Fourth" },
  { timeText: "6:00 PM", summary: "Fifth" },
  { timeText: "8:30 PM", summary: "Sixth" },
]

const M5PAPER = {
  width: 960,
  height: 540,
  colourMode: "mono",
} as const

const IMPRESSION = {
  width: 800,
  height: 480,
  colourMode: "e6",
} as const

const PHAT = {
  width: 250,
  height: 122,
  colourMode: "mono",
} as const

describe("countRowsThatFit", () => {
  test("counts only the rows that finish inside the height", () => {
    expect(
      countRowsThatFit({
        availableHeight: 100,
        rowHeight: 30,
      }),
    ).toBe(3)
  })

  test("a height too short for one row draws none", () => {
    expect(
      countRowsThatFit({
        availableHeight: 20,
        rowHeight: 30,
      }),
    ).toBe(0)
  })

  test("a zero row height cannot divide, so nothing fits", () => {
    expect(
      countRowsThatFit({
        availableHeight: 100,
        rowHeight: 0,
      }),
    ).toBe(0)
  })
})

describe("ClockAgendaView keeps every drawn row on the panel", () => {
  test("the 960x540 M5Paper draws the three most imminent events", () => {
    const node = ClockAgendaView({
      ...M5PAPER,
      time: "12:58 AM",
      date: "Monday, September 14",
      temperatureText: "71°",
      conditionText: "Clear night",
      events: EVENTS,
    })
    expect(
      getDrawnSummaries({ node, events: EVENTS }),
    ).toEqual(["First", "Second", "Third"])
  })

  test("the 800x480 Impression draws three", () => {
    const node = ClockAgendaView({
      ...IMPRESSION,
      time: "12:45 AM",
      date: "Thursday, July 2",
      temperatureText: "71°",
      conditionText: "Clear night",
      events: EVENTS,
    })
    expect(
      getDrawnSummaries({ node, events: EVENTS }).length,
    ).toBe(3)
  })

  test("the 250x122 pHAT draws three", () => {
    const node = ClockAgendaView({
      ...PHAT,
      time: "12:45a",
      date: "Th-02",
      temperatureText: "71°",
      conditionText: "Clear",
      events: EVENTS,
    })
    expect(
      getDrawnSummaries({ node, events: EVENTS }).length,
    ).toBe(3)
  })

  test("fewer events than the panel holds are all drawn", () => {
    const twoEvents = EVENTS.slice(0, 2)
    const node = ClockAgendaView({
      ...M5PAPER,
      time: "12:58 AM",
      date: "Monday, September 14",
      temperatureText: "71°",
      conditionText: "Clear night",
      events: twoEvents,
    })
    expect(
      getDrawnSummaries({ node, events: twoEvents }),
    ).toEqual(["First", "Second"])
  })

  test("a free day drops the heading, so the view reads as the weather clock", () => {
    const node = ClockAgendaView({
      ...M5PAPER,
      time: "12:58 AM",
      date: "Monday, September 14",
      temperatureText: "71°",
      conditionText: "Clear night",
      events: [],
    })
    expect(collectText(node)).not.toContain("Today")
  })
})

describe("AgendaView keeps every drawn row on the panel", () => {
  test("the 800x480 Impression draws five", () => {
    const node = AgendaView({
      ...IMPRESSION,
      date: "Thursday, July 2",
      temperatureText: "71°",
      conditionText: "Clear night",
      events: EVENTS,
      emptyText: "Nothing else today",
    })
    expect(
      getDrawnSummaries({ node, events: EVENTS }).length,
    ).toBe(5)
  })

  test("the 250x122 pHAT draws three", () => {
    const node = AgendaView({
      ...PHAT,
      date: "Th-02",
      temperatureText: "71°",
      conditionText: "Clear",
      events: EVENTS,
      emptyText: "Nothing else today",
    })
    expect(
      getDrawnSummaries({ node, events: EVENTS }).length,
    ).toBe(3)
  })

  test("only a genuinely free day says there is nothing left", () => {
    const freeDay = AgendaView({
      ...M5PAPER,
      date: "Monday, September 14",
      events: [],
      emptyText: "Nothing else today",
    })
    expect(collectText(freeDay)).toContain(
      "Nothing else today",
    )

    const busyDay = AgendaView({
      ...M5PAPER,
      date: "Monday, September 14",
      events: EVENTS,
      emptyText: "Nothing else today",
    })
    expect(collectText(busyDay)).not.toContain(
      "Nothing else today",
    )
  })
})
