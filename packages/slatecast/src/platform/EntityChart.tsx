import type { ContractData } from "@castkit/sdk/contracts"

type Entity =
  ContractData["entities.v1"]["entities"][number]
type Sample = { time: number; value: number }
const timeValue = (value: unknown) =>
  typeof value === "number"
    ? value
    : Date.parse(String(value))
const objectSamples = (
  value: unknown,
): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter(
        (point): point is Record<string, unknown> =>
          Boolean(point) && typeof point === "object",
      )
    : []

/** Time-weighted step means use the display's local calendar days (including DST).
 * A value lasts until the next observation, or now; no data is invented before the first sample.
 */
export const chartSamples = ({
  history,
  aggregation,
  now = Date.now(),
}: {
  now?: number
  history: unknown
  aggregation?: unknown
}): Sample[] => {
  const samples = objectSamples(history)
    .flatMap((point) => {
      const time = timeValue(point.time)
      const value =
        typeof point.value === "number"
          ? point.value
          : Number.NaN
      return Number.isFinite(time) && Number.isFinite(value)
        ? [{ time, value }]
        : []
    })
    .sort((left, right) => left.time - right.time)
  if (aggregation !== "daily-mean") return samples
  const days = new Map<
    number,
    { weightedTotal: number; duration: number }
  >()
  samples.forEach((sample, index) => {
    // Bound work for malformed upstream timestamps; sources retain much shorter histories.
    let cursor = Math.max(sample.time, now - 366 * 86400000)
    const end = Math.min(
      samples[index + 1]?.time ?? now,
      now,
    )
    while (cursor < end) {
      const day = new Date(cursor)
      day.setHours(0, 0, 0, 0)
      const tomorrow = new Date(day)
      tomorrow.setDate(tomorrow.getDate() + 1)
      const segmentEnd = Math.min(end, tomorrow.getTime())
      const duration = segmentEnd - cursor
      const previous = days.get(day.getTime()) ?? {
        weightedTotal: 0,
        duration: 0,
      }
      days.set(day.getTime(), {
        weightedTotal:
          previous.weightedTotal + sample.value * duration,
        duration: previous.duration + duration,
      })
      cursor = segmentEnd
    }
  })
  return [...days.entries()].map(([time, summary]) => ({
    time,
    value: summary.weightedTotal / summary.duration,
  }))
}
const labelTime = (time: number, isDaily: boolean) =>
  new Date(time).toLocaleString(
    [],
    isDaily
      ? { month: "short", day: "numeric" }
      : {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        },
  )

/** Numeric charts and categorical state timelines consume normalized source history. */
export const EntityChart = ({
  entity,
  settings,
  now,
}: {
  entity: Entity
  settings: Record<string, unknown>
  now: number
}) => {
  const samples = chartSamples({
    history: entity.attributes.history,
    aggregation: settings.aggregation,
    now,
  })
  const isDaily = settings.aggregation === "daily-mean"
  if (samples.length === 0) {
    const states = objectSamples(
      entity.attributes.stateHistory,
    )
      .flatMap((point) => {
        const time = timeValue(point.time)
        return Number.isFinite(time) &&
          typeof point.state === "string"
          ? [{ time, state: point.state }]
          : []
      })
      .sort((left, right) => left.time - right.time)
    const first = states[0]
    if (!first) return <p>No history available</p>
    const lastTime = Math.max(
      now,
      (states.at(-1)?.time ?? first.time) + 1,
    )
    const labels = [
      ...new Set(states.map((point) => point.state)),
    ]
    return (
      <figure class="platform-chart">
        <svg
          viewBox="0 0 400 56"
          role="img"
          aria-label={`${entity.name} state history: ${labels.join(", ")}`}
        >
          {states.map((point, index) => (
            <rect
              key={`${point.time}:${index}`}
              x={
                10 +
                ((point.time - first.time) /
                  (lastTime - first.time)) *
                  380
              }
              y="8"
              width={Math.max(
                0.5,
                (((states[index + 1]?.time ?? lastTime) -
                  point.time) /
                  (lastTime - first.time)) *
                  380,
              )}
              height="40"
              fill={`hsl(${(labels.indexOf(point.state) * 137 + 195) % 360} 55% 50%)`}
            >
              <title>
                {point.state} ·{" "}
                {labelTime(point.time, false)}
              </title>
            </rect>
          ))}
        </svg>
        <figcaption>
          {labelTime(first.time, false)}–
          {labelTime(lastTime, false)}
          <span class="platform-chart-legend">
            {labels.map((label, index) => (
              <span key={label}>
                <i
                  style={{
                    backgroundColor: `hsl(${(index * 137 + 195) % 360} 55% 50%)`,
                  }}
                />
                {label}
              </span>
            ))}
          </span>
        </figcaption>
      </figure>
    )
  }
  const minimum = Math.min(
    ...samples.map((point) => point.value),
  )
  const maximum = Math.max(
    ...samples.map((point) => point.value),
  )
  const firstTime = samples[0]?.time ?? now
  const lastTime = samples.at(-1)?.time ?? firstTime
  const isBar = settings.chartType === "bar"
  const lower = isBar ? Math.min(0, minimum) : minimum
  const upper = isBar ? Math.max(0, maximum) : maximum
  const positionY = (value: number) =>
    110 -
    ((value - lower) / Math.max(1, upper - lower)) * 100
  const positionX = (time: number) =>
    10 +
    ((time - firstTime) /
      Math.max(1, lastTime - firstTime)) *
      380
  const format = (value: number) =>
    Number(value.toFixed(2)).toLocaleString()
  return (
    <figure class="platform-chart">
      <svg
        viewBox="0 0 400 120"
        role="img"
        aria-label={`${entity.name}: ${format(minimum)} to ${format(maximum)}${isDaily ? ", daily mean" : ""}`}
      >
        {isBar ? (
          samples.map((point, index) => (
            <rect
              key={point.time}
              x={10 + index * (380 / samples.length)}
              y={Math.min(
                positionY(point.value),
                positionY(0),
              )}
              width={Math.max(1, 380 / samples.length - 4)}
              height={Math.max(
                1,
                Math.abs(
                  positionY(point.value) - positionY(0),
                ),
              )}
              fill="currentColor"
            >
              <title>
                {labelTime(point.time, isDaily)} ·{" "}
                {format(point.value)}
              </title>
            </rect>
          ))
        ) : samples.length === 1 ? (
          <circle
            cx="200"
            cy={positionY(samples[0]?.value ?? 0)}
            r="4"
            fill="currentColor"
          />
        ) : (
          <polyline
            points={samples
              .map(
                (point) =>
                  `${positionX(point.time)},${positionY(point.value)}`,
              )
              .join(" ")}
            fill="none"
            stroke="currentColor"
            stroke-width="3"
          />
        )}
      </svg>
      <figcaption>
        {format(minimum)}–{format(maximum)}{" "}
        {String(
          entity.attributes.unit_of_measurement ?? "",
        )}{" "}
        · {isDaily ? "Daily mean · " : ""}
        {labelTime(firstTime, isDaily)}–
        {labelTime(lastTime, isDaily)}
      </figcaption>
    </figure>
  )
}
