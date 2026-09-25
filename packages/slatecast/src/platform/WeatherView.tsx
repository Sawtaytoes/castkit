import type { ContractData } from "@castkit/sdk/contracts"
import {
  WEATHER_CONDITION_CODES,
  type WeatherConditionCode,
} from "@castkit/shared/viewData/types"
import { WeatherMark } from "../WeatherMark.tsx"

/** Current weather and normalized hourly or daily forecasts share one source contract. */
export const WeatherView = ({
  data,
}: {
  data: ContractData["weather.v1"]
}) => (
  <div class="platform-weather">
    <header>
      <strong>{data.temperatureText}</strong>
      <p>{data.conditionText}</p>
    </header>
    {data.forecast?.length ? (
      <div class="platform-forecast">
        {data.forecast.slice(0, 16).map((entry, index) => (
          <article key={`${entry.datetime}:${index}`}>
            <time dateTime={entry.datetime}>
              {new Date(entry.datetime).toLocaleString([], {
                weekday: "short",
                hour: "numeric",
              })}
            </time>
            {entry.condition &&
            (
              WEATHER_CONDITION_CODES as readonly string[]
            ).includes(entry.condition) ? (
              <WeatherMark
                condition={
                  entry.condition as WeatherConditionCode
                }
                class="platform-weather-mark"
              />
            ) : null}
            <strong>
              {entry.temperature}
              {data.temperatureUnit ?? "°"}
              {entry.temperatureLow !== undefined
                ? ` / ${entry.temperatureLow}${data.temperatureUnit ?? "°"}`
                : ""}
            </strong>
            {entry.precipitationProbability !==
            undefined ? (
              <span>
                {entry.precipitationProbability}% rain
              </span>
            ) : null}
            {entry.precipitation !== undefined ? (
              <span>
                {entry.precipitation}{" "}
                {data.precipitationUnit ?? ""}
              </span>
            ) : null}
          </article>
        ))}
      </div>
    ) : null}
  </div>
)
