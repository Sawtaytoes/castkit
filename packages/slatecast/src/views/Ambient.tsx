import type { BrowserClockConfig } from "@castkit/shared/protocol/ws"
import type { WeatherData } from "@castkit/shared/viewData/types"
import { clockConfig, nowMs, weather } from "../state.ts"
import {
  formatClockDate,
  formatClockTime,
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
 * Every panel draws the same centered column: the time with its meridiem on
 * one line, the date beneath, the temperature and condition on one row below
 * that, led by the condition's mark in the accent color when Home Assistant
 * sent a code CastKit knows. The owner chose this composition on 2026-09-25
 * over the two-column
 * layout an agent gave the short landscape panel on 2026-09-12. The short
 * panel keeps the column and only swaps `vmin` for px, because `vmin` is
 * 3.2 px on that glass and gave the date 16 px. See
 * `docs/decisions/2026-09-25-ambient-is-one-centered-column-on-every-panel.md`
 * and `docs/decisions/2026-09-25-ambient-weather-row-carries-the-condition-mark.md`.
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

  return (
    <div
      class={`ambient${isShortPanel ? " ambient-short" : ""}`}
    >
      <div class="ambient-time">
        {formatClockTime(currentMillis, clock)}
      </div>
      <div class="ambient-date">
        {formatClockDate(currentMillis, clock)}
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
