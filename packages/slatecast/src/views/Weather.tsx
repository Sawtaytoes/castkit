import { clockConfig, nowMs, weather } from "../state.ts"
import {
  formatClockDate,
  formatClockDateLines,
  formatClockTime,
} from "../time.ts"
import { useIsShortPanel } from "../useIsShortPanel.ts"
import { WeatherMark } from "../WeatherMark.tsx"

/**
 * A reading of four characters or more ("-12°", "104°") is one size step
 * smaller on the short panel, so it never leaves the glass.
 */
const LONG_TEMPERATURE_LENGTH = 4
/** "Thunderstorms" and "Severe weather" step down the same way. */
const LONG_CONDITION_LENGTH = 11

/**
 * Weather-forward view: the current temperature + condition are the anchor,
 * with a smaller clock + date beneath. Distinct from Ambient (where the clock
 * is the anchor and weather is a footnote). Weather is retained MQTT pushed by
 * Home Assistant, so it survives reconnects and appears the moment HA
 * publishes; until then a placeholder line shows.
 *
 * On the short landscape panel the clock moves beside the weather instead of
 * beneath it: temperature and condition at the left, and at the right the
 * condition's mark over the time, the weekday and the date. The mark is drawn
 * from the HA condition code (`WeatherMark`), so it is absent when HA sent a
 * code CastKit does not know.
 */
export const Weather = () => {
  const isShortPanel = useIsShortPanel()
  const data = weather.value
  const currentMillis = nowMs.value
  const clock = clockConfig.value

  const isLongTemperature =
    (data?.temperatureText.length ?? 0) >=
    LONG_TEMPERATURE_LENGTH
  const isLongCondition =
    (data?.conditionText.length ?? 0) >=
    LONG_CONDITION_LENGTH

  const main = data ? (
    <div class="weather-main">
      <div
        class={`weather-temp${isShortPanel && isLongTemperature ? " is-long" : ""}`}
      >
        {data.temperatureText}
      </div>
      <div
        class={`weather-condition${isShortPanel && isLongCondition ? " is-long" : ""}`}
      >
        {data.conditionText}
      </div>
    </div>
  ) : (
    <div class="weather-empty">Weather unavailable</div>
  )

  if (!isShortPanel) {
    return (
      <div class="weather">
        {main}
        <div class="weather-clock">
          <span class="weather-time">
            {formatClockTime(currentMillis, clock)}
          </span>
          <span class="weather-date">
            {formatClockDate(currentMillis, clock)}
          </span>
        </div>
      </div>
    )
  }

  const dateLines = formatClockDateLines(
    currentMillis,
    clock,
  )

  return (
    <div class="weather weather-short">
      {main}
      <div class="weather-side">
        {data?.condition ? (
          <WeatherMark condition={data.condition} />
        ) : null}
        <span class="weather-time">
          {formatClockTime(currentMillis, clock)}
        </span>
        {dateLines.map((line, index) => (
          <span
            key={line}
            class={
              index === 0
                ? "weather-date weather-date-weekday"
                : "weather-date"
            }
          >
            {line}
          </span>
        ))}
      </div>
    </div>
  )
}
