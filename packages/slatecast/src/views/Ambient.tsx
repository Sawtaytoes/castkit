import type { BrowserClockConfig } from "@castkit/shared/protocol/ws"
import type { WeatherData } from "@castkit/shared/viewData/types"
import { clockConfig, nowMs, weather } from "../state.ts"
import {
  formatClockDate,
  formatClockDateLines,
  formatClockTime,
  formatClockTimeParts,
} from "../time.ts"
import { useIsShortPanel } from "../useIsShortPanel.ts"
import { WeatherMark } from "../WeatherMark.tsx"

/**
 * Ambient view: a big clock with today's date, plus the current weather
 * (temperature + condition) when Home Assistant has pushed it to
 * `<base>/<id>/weather/set`. The clock is client-side off the shared 1 Hz
 * tick, formatted with the server-stamped global clock config; weather is
 * retained MQTT, so it survives reconnects and appears the moment HA publishes.
 *
 * On the short landscape panel the column becomes two: the time with its
 * meridiem beside it and the date beneath at the left, and the condition's
 * mark over the temperature and condition at the right. Same treatment its
 * three neighbors got on 2026-09-11 — this view was left out of that change
 * and kept sizing in `vmin`, which is 3.2 px on that glass, so its date and
 * condition rendered at 16 px. It is the view an empty day lands on, so it is
 * read daily from a workbench.
 *
 * The date breaks into the weekday over the month and day, the same two lines
 * the Weather view uses there. Left as one string it wrapped anyway, and it
 * wrapped after the comma — "Saturday," alone on a line. Under the numeric
 * date setting `formatClockDateLines` returns one line, so the break is a
 * property of the format rather than a hard-coded split.
 */
export const Ambient = () => (
  <AmbientFace
    currentMillis={nowMs.value}
    clock={clockConfig.value}
    weather={weather.value}
  />
)

/** The Ambient view's drawing, fed by its caller; see `ClockFace`. */
export const AmbientFace = ({
  currentMillis,
  clock,
  weather: data,
}: {
  currentMillis: number
  clock: BrowserClockConfig | undefined
  weather: WeatherData | null | undefined
}) => {
  const isShortPanel = useIsShortPanel()

  if (!isShortPanel) {
    return (
      <div class="ambient">
        <div class="ambient-time">
          {formatClockTime(currentMillis, clock)}
        </div>
        <div class="ambient-date">
          {formatClockDate(currentMillis, clock)}
        </div>
        {data ? (
          <div class="ambient-weather">
            <span class="ambient-temp">
              {data.temperatureText}
            </span>
            <span class="ambient-condition">
              {data.conditionText}
            </span>
          </div>
        ) : null}
      </div>
    )
  }

  const { time, meridiem } = formatClockTimeParts(
    currentMillis,
    clock,
  )

  return (
    <div class="ambient ambient-short">
      <div class="ambient-clock">
        <span class="ambient-clock-row">
          <span class="ambient-time">{time}</span>
          {meridiem ? (
            <span class="ambient-meridiem">{meridiem}</span>
          ) : null}
        </span>
        {formatClockDateLines(currentMillis, clock).map(
          (line, index) => (
            <span
              key={line}
              class={
                index === 0
                  ? "ambient-date ambient-date-weekday"
                  : "ambient-date"
              }
            >
              {line}
            </span>
          ),
        )}
      </div>
      {data ? (
        <div class="ambient-weather">
          {data.condition ? (
            <WeatherMark condition={data.condition} />
          ) : null}
          <span class="ambient-temp">
            {data.temperatureText}
          </span>
          <span class="ambient-condition">
            {data.conditionText}
          </span>
        </div>
      ) : null}
    </div>
  )
}
