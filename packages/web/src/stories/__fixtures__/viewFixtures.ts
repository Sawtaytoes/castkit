import type { ClockAgendaEvent } from "@castkit/views/ClockAgendaView"

/**
 * Mock view data for the stories — the browser-side stand-in for what Home
 * Assistant pushes over MQTT.
 *
 * The server formats every string before it reaches a view (see
 * `renderViewElement`), and it picks compact formats for short panels:
 * `COMPACT_PANEL_MAX_HEIGHT` is 200, which is what separates the 122px-tall
 * pHAT from every other panel. These fixtures mirror that split so a story on
 * the pHAT shows the strings the pHAT would really get, not the long ones
 * squeezed down.
 */

/** Panels at or below this height get the compact strings. Mirrors the server. */
const COMPACT_PANEL_MAX_HEIGHT = 200

export const getIsCompactPanel = (height: number) =>
  height <= COMPACT_PANEL_MAX_HEIGHT

/** A fixed instant, so stories never differ between two renders of the day. */
export const buildClockStringsFixture = (
  height: number,
) =>
  getIsCompactPanel(height)
    ? { time: "1:34p", date: "We-02" }
    : { time: "1:34 PM", date: "Wednesday, July 2" }

export const buildWeatherFixture = () => ({
  temperatureText: "79°",
  conditionText: "Partly cloudy",
})

/**
 * Upcoming events, already sorted and sliced the way the server would: three
 * for a compact panel, four for a large one. The long summary is deliberate —
 * an agenda row that overflows is the failure this preview exists to catch.
 */
export const buildAgendaEventsFixture = (
  height: number,
): readonly ClockAgendaEvent[] =>
  getIsCompactPanel(height)
    ? [
        { timeText: "2:30p", summary: "Dentist" },
        { timeText: "4:00p", summary: "Pick up kids" },
        { timeText: "All", summary: "Ashlee's birthday" },
      ]
    : [
        {
          timeText: "2:30 PM",
          summary: "Dentist appointment",
        },
        {
          timeText: "4:00 PM",
          summary: "Pick up kids from swimming practice",
        },
        {
          timeText: "6:30 PM",
          summary: "Dinner with the Parkers",
        },
        {
          timeText: "All day",
          summary: "Ashlee's birthday",
        },
      ]

export const buildNowPlayingFixture = () => ({
  artist: "Twilight Force",
  title: "Dawn of the Dragonstar",
  album: "Dawn of the Dragonstar",
  isPlaying: true,
})

/** The empty-agenda case, which every agenda view degrades differently for. */
export const NO_AGENDA_EVENTS: readonly ClockAgendaEvent[] =
  []
