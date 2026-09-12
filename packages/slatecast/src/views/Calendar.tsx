import {
  agenda,
  clockConfig,
  nowMs,
  weather,
} from "../state.ts"
import {
  formatClockDate,
  formatClockTime,
  formatClockTimeParts,
  formatEventTime,
} from "../time.ts"
import { useIsShortPanel } from "../useIsShortPanel.ts"
import { WeatherMark } from "../WeatherMark.tsx"

/** How many upcoming events the panel shows at once. */
const EVENT_BUDGET = 6
/**
 * The short landscape panel has room for five rows under its one-row header
 * at a size that reads from the workbench; a sixth would push the last row off
 * the glass.
 */
const SHORT_PANEL_EVENT_BUDGET = 5

/**
 * Keep a timed event on-screen for a grace window after it starts, so an
 * in-progress event doesn't vanish the instant the clock passes it.
 */
const IN_PROGRESS_GRACE_MILLIS = 60 * 60 * 1_000

/**
 * Calendar view: a header clock + date, the current weather, then today's
 * upcoming agenda. Home Assistant pushes the full day's events (sorted
 * ascending) to `<base>/<id>/agenda/set`; this filters to still-upcoming and
 * slices to the panel's budget on every 1 Hz tick — no refetch. All-day events
 * always show.
 *
 * The weather line mirrors the ePaper `Clock (Agenda)` view, which has always
 * carried time + date + weather + agenda together. It is the idle view a
 * display parks on, so the same four facts belong on both renderers. Weather
 * comes from retained MQTT (`<base>/<id>/weather/set`), so the line is absent
 * until Home Assistant publishes and then survives reconnects.
 *
 * On the short landscape panel the header is one row: time over date at the
 * left, the condition mark with the temperature over the condition at the
 * right, and every remaining pixel goes to the agenda rows. The stylesheet
 * places the two header blocks side by side; the markup only adds the mark
 * and the split meridiem.
 */
export const Calendar = () => {
  const isShortPanel = useIsShortPanel()
  const currentMillis = nowMs.value
  const clock = clockConfig.value
  const weatherData = weather.value
  const upcomingEvents = (agenda.value?.events ?? [])
    .filter(
      (event) =>
        event.isAllDay ||
        event.startMs >=
          currentMillis - IN_PROGRESS_GRACE_MILLIS,
    )
    .slice(
      0,
      isShortPanel
        ? SHORT_PANEL_EVENT_BUDGET
        : EVENT_BUDGET,
    )
  const { time, meridiem } = formatClockTimeParts(
    currentMillis,
    clock,
  )

  return (
    <div
      class={`calendar${isShortPanel ? " calendar-short" : ""}`}
    >
      <div class="calendar-header">
        {isShortPanel ? (
          <span class="calendar-clock">
            <span class="calendar-time">{time}</span>
            {meridiem ? (
              <span class="calendar-meridiem">
                {meridiem}
              </span>
            ) : null}
          </span>
        ) : (
          <span class="calendar-time">
            {formatClockTime(currentMillis, clock)}
          </span>
        )}
        <span class="calendar-date">
          {formatClockDate(currentMillis, clock)}
        </span>
      </div>
      {weatherData ? (
        <div class="calendar-weather">
          {isShortPanel && weatherData.condition ? (
            <WeatherMark
              condition={weatherData.condition}
            />
          ) : null}
          <span class="calendar-weather-text">
            <span class="calendar-temp">
              {weatherData.temperatureText}
            </span>
            <span class="calendar-condition">
              {weatherData.conditionText}
            </span>
          </span>
        </div>
      ) : null}
      {upcomingEvents.length > 0 ? (
        <ul class="calendar-events">
          {upcomingEvents.map((event) => (
            <li
              key={`${event.startMs}-${event.summary}`}
              class="calendar-event"
            >
              <span class="calendar-event-time">
                {formatEventTime({
                  startMillis: event.startMs,
                  isAllDay: event.isAllDay,
                  clock,
                })}
              </span>
              <span class="calendar-event-summary">
                {event.summary}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div class="calendar-empty">No upcoming events</div>
      )}
    </div>
  )
}
