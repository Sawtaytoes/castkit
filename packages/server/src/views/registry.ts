import type { DeviceMetadata } from "@castkit/core/devices/device"
import type { ViewName } from "@castkit/shared/views/viewNames"
import { getIsPhotoView } from "@castkit/shared/views/viewNames"
import { AgendaView } from "@castkit/views/AgendaView"
import { ClockAgendaView } from "@castkit/views/ClockAgendaView"
import { ClockView } from "@castkit/views/ClockView"
import { ClockWeatherView } from "@castkit/views/ClockWeatherView"
import { NowPlayingDashboard } from "@castkit/views/NowPlayingDashboard"
import { NowPlayingPoster } from "@castkit/views/NowPlayingPoster"
import { PhotoFrameView } from "@castkit/views/PhotoFrameView"
import { createElement, type ReactElement } from "react"
import { IDLE_NOW_PLAYING } from "../mqtt/viewDataPayloads.ts"
import type {
  AgendaData,
  NowPlayingData,
  PhotoFrameData,
  WeatherData,
} from "../state/viewDataStore.ts"

/**
 * The views a device can show, and how to turn a view name + device + view
 * data into a React element to render. View names are human-readable — they
 * appear verbatim in Home Assistant's View select — and double as the API/
 * MQTT payload values. Now-playing / weather / agenda data is pushed by Home
 * Assistant over MQTT (undefined = no data yet → idle placeholder);
 * clock-bearing views use the server clock in the process timezone (`TZ`).
 */

const NOW_PLAYING_VIEW_NAMES: ReadonlySet<ViewName> =
  new Set([
    "Now Playing (Dashboard)",
    "Now Playing (Poster)",
  ])

/**
 * Views that display the time and need the minute re-push. "Agenda" is
 * deliberately ABSENT: it shows no clock, so it stays valid until the agenda
 * data changes. That is the entire reason it exists — a per-minute repaint on
 * a slow-refreshing colour ePaper panel is unusable.
 */
const CLOCK_BEARING_VIEW_NAMES: ReadonlySet<ViewName> =
  new Set([
    "Now Playing (Dashboard)",
    "Clock",
    "Clock (Weather)",
    "Clock (Agenda)",
  ])

/** Views that render the pushed agenda data, clock-bearing or not. */
const AGENDA_VIEW_NAMES: ReadonlySet<ViewName> = new Set([
  "Clock (Agenda)",
  "Agenda",
])

export const getIsAgendaView = (viewName: ViewName) =>
  AGENDA_VIEW_NAMES.has(viewName)

export const getIsNowPlayingView = (viewName: ViewName) =>
  NOW_PLAYING_VIEW_NAMES.has(viewName)

export const getIsClockBearingView = (viewName: ViewName) =>
  CLOCK_BEARING_VIEW_NAMES.has(viewName)

/**
 * How the clock views render time + date. Resolved per device from the HA/MQTT
 * config entities (global default + per-device override): the timezone (IANA
 * name, or undefined = the process `TZ`), 12- vs 24-hour time, and long vs
 * numeric dates. Time itself comes from Inkcast's own clock, not from HA.
 */
export type ClockConfig = {
  /** IANA timezone name, or undefined = the process default (`TZ`). */
  timeZone: string | undefined
  /** 12-hour clock (`2:30 PM`) when true, 24-hour (`14:30`) when false. */
  isTwelveHour: boolean
  /** Numeric date (`7/5/2026`) when true, long (`Sunday, July 5`) when false. */
  isNumericDate: boolean
}

const formatTime = (now: Date, clock: ClockConfig) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: clock.timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: clock.isTwelveHour,
  }).format(now)

const formatDate = (now: Date, clock: ClockConfig) =>
  new Intl.DateTimeFormat(
    "en-US",
    clock.isNumericDate
      ? {
          timeZone: clock.timeZone,
          year: "numeric",
          month: "numeric",
          day: "numeric",
        }
      : {
          timeZone: clock.timeZone,
          weekday: "long",
          month: "long",
          day: "numeric",
        },
  ).format(now)

/** `11:50p` — every character earns its place on a 250px panel. */
const formatCompactTime = (now: Date, clock: ClockConfig) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: clock.timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: clock.isTwelveHour,
  })
    .format(now)
    .replace(" AM", "a")
    .replace(" PM", "p")

/**
 * `Tu-02` — two-letter weekday plus the day (month is obvious in person).
 * Derived via `formatToParts` in the configured timezone so the day number is
 * correct even when the panel's timezone differs from the process one.
 */
const formatCompactDate = (
  now: Date,
  clock: ClockConfig,
) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: clock.timeZone,
    weekday: "short",
    day: "2-digit",
  }).formatToParts(now)
  const weekday = (
    parts.find((part) => part.type === "weekday")?.value ??
    ""
  ).slice(0, 2)
  const day =
    parts.find((part) => part.type === "day")?.value ?? ""
  return `${weekday}-${day}`
}

/** `2:30 PM` on the large panel, `2:30p` on the compact one; all-day → label. */
const formatEventTime = ({
  startMs,
  isAllDay,
  isCompact,
  clock,
}: {
  startMs: number
  isAllDay: boolean
  isCompact: boolean
  clock: ClockConfig
}) => {
  if (isAllDay) {
    return isCompact ? "All" : "All day"
  }
  const eventDate = new Date(startMs)
  return isCompact
    ? formatCompactTime(eventDate, clock)
    : formatTime(eventDate, clock)
}

/** How many events each panel can legibly show. */
const MAX_AGENDA_EVENTS_COMPACT = 3
const MAX_AGENDA_EVENTS_LARGE = 4

/** Small panels get the compact date/time formats. */
const COMPACT_PANEL_MAX_HEIGHT = 200

/** Build the React element for a device's active view at a given instant. */
export const renderViewElement = ({
  viewName,
  device,
  now,
  clock,
  nowPlaying,
  photoFrame,
  weather,
  agenda,
}: {
  viewName: ViewName
  device: DeviceMetadata
  now: Date
  clock: ClockConfig
  nowPlaying?: NowPlayingData
  photoFrame?: PhotoFrameData
  weather?: WeatherData
  agenda?: AgendaData
}): ReactElement => {
  const panel = {
    width: device.width,
    height: device.height,
    colourMode: device.colourMode,
  }
  const nowPlayingProps = nowPlaying ?? IDLE_NOW_PLAYING
  const isCompactClock =
    device.height <= COMPACT_PANEL_MAX_HEIGHT

  if (viewName === "Clock") {
    return createElement(ClockView, {
      ...panel,
      time: formatTime(now, clock),
      date: formatDate(now, clock),
    })
  }
  if (viewName === "Clock (Weather)") {
    return createElement(ClockWeatherView, {
      ...panel,
      time: isCompactClock
        ? formatCompactTime(now, clock)
        : formatTime(now, clock),
      date: isCompactClock
        ? formatCompactDate(now, clock)
        : formatDate(now, clock),
      temperatureText: weather?.temperatureText,
      conditionText: weather?.conditionText,
    })
  }
  // Drop timed events that have already started (matches "revert when it
  // starts"), but keep all-day events for their whole day — their start is
  // midnight, so a start-time filter would wrongly hide them all day. Then
  // slice to what the panel can legibly hold. Times are formatted per panel
  // size here so the views stay pure functions of their props. Shared by both
  // agenda views so they never disagree about what "upcoming" means.
  const buildAgendaEvents = () => {
    const upcomingEvents = (agenda?.events ?? []).filter(
      (event) =>
        event.isAllDay || event.startMs >= now.getTime(),
    )
    const maxEvents = isCompactClock
      ? MAX_AGENDA_EVENTS_COMPACT
      : MAX_AGENDA_EVENTS_LARGE
    return upcomingEvents
      .slice(0, maxEvents)
      .map((event) => ({
        timeText: formatEventTime({
          startMs: event.startMs,
          isAllDay: event.isAllDay,
          isCompact: isCompactClock,
          clock,
        }),
        summary: event.summary,
      }))
  }

  if (viewName === "Agenda") {
    return createElement(AgendaView, {
      ...panel,
      date: formatDate(now, clock),
      temperatureText: weather?.temperatureText,
      conditionText: weather?.conditionText,
      events: buildAgendaEvents(),
      emptyText: "Nothing else today",
    })
  }
  if (viewName === "Clock (Agenda)") {
    const events = buildAgendaEvents()
    return createElement(ClockAgendaView, {
      ...panel,
      time: isCompactClock
        ? formatCompactTime(now, clock)
        : formatTime(now, clock),
      date: isCompactClock
        ? formatCompactDate(now, clock)
        : formatDate(now, clock),
      temperatureText: weather?.temperatureText,
      conditionText: weather?.conditionText,
      events,
    })
  }
  if (getIsPhotoView(viewName)) {
    // Every photo view paints the same server-composed PNG; the adapter builds
    // it differently per view (letterbox / fill / dual portrait).
    return createElement(PhotoFrameView, {
      ...panel,
      photoDataUri: photoFrame?.photoDataUri,
    })
  }
  if (viewName === "Now Playing (Poster)") {
    return createElement(NowPlayingPoster, {
      ...panel,
      ...nowPlayingProps,
    })
  }

  const isCompactPanel =
    device.height <= COMPACT_PANEL_MAX_HEIGHT
  return createElement(NowPlayingDashboard, {
    ...panel,
    ...nowPlayingProps,
    time: isCompactPanel
      ? formatCompactTime(now, clock)
      : formatTime(now, clock),
    date: isCompactPanel
      ? formatCompactDate(now, clock)
      : formatDate(now, clock),
  })
}
