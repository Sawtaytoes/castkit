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
 * Upcoming events, already sorted, in the strings the server would send for
 * this panel's size. Deliberately MORE than any panel here can draw: the views
 * trim to the rows that finish on the glass, so a story that handed over
 * exactly three would never show that trim working. The long summary is
 * deliberate too — a row that runs off the right edge is the other failure
 * this preview exists to catch.
 */
export const buildAgendaEventsFixture = (
  height: number,
): readonly ClockAgendaEvent[] =>
  getIsCompactPanel(height)
    ? [
        { timeText: "2:30p", summary: "Dentist" },
        { timeText: "4:00p", summary: "Pick up kids" },
        { timeText: "All", summary: "Family birthday" },
        { timeText: "6:30p", summary: "Dinner, Parkers" },
        { timeText: "8:00p", summary: "Trash to the curb" },
        { timeText: "9:15p", summary: "Call Grandma" },
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
          summary: "Dinner with the Whitfields",
        },
        {
          timeText: "All day",
          summary: "Family birthday",
        },
        {
          timeText: "8:00 PM",
          summary: "Take the trash to the curb",
        },
        {
          timeText: "9:15 PM",
          summary: "Call Grandma",
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
