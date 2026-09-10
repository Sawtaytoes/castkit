import {
  agenda,
  clockConfig,
  nowMs,
  weather,
} from "../state.ts"
import {
  formatClockDate,
  formatClockTime,
  formatEventTime,
} from "../time.ts"

/** How many upcoming events the panel shows at once. */
const EVENT_BUDGET = 6

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
 */
export const Calendar = () => {
  const currentMillis = nowMs.value
  const weatherData = weather.value
  const upcomingEvents = (agenda.value?.events ?? [])
    .filter(
      (event) =>
        event.isAllDay ||
        event.startMs >=
          currentMillis - IN_PROGRESS_GRACE_MILLIS,
    )
    .slice(0, EVENT_BUDGET)

  return (
    <div class="calendar">
      <div class="calendar-header">
        <span class="calendar-time">
          {formatClockTime(
            currentMillis,
            clockConfig.value,
          )}
        </span>
        <span class="calendar-date">
          {formatClockDate(
            currentMillis,
            clockConfig.value,
          )}
        </span>
      </div>
      {weatherData ? (
        <div class="calendar-weather">
          <span class="calendar-temp">
            {weatherData.temperatureText}
          </span>
          <span class="calendar-condition">
            {weatherData.conditionText}
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
                  clock: clockConfig.value,
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
