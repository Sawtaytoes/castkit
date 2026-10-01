// biome-ignore-all lint/security/noDangerouslySetInnerHtml: The shared chart renderer escapes producer text and restricts color references.
import type { ContractData } from "@castkit/sdk/contracts"
import {
  type ChartSeries,
  renderChartSvg,
} from "@charcuterie/logic/core"
import {
  useLayoutEffect,
  useRef,
  useState,
} from "preact/hooks"

type HistoryData = ContractData["points-history.v1"]
const points = (value: number) =>
  new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
  }).format(value)
/** One portable chart, fed exclusively by producer-calculated history, for browser and image deliveries. */
export const PointsHistoryView = ({
  data,
  settings,
}: {
  data: HistoryData
  settings: Record<string, unknown>
}) => {
  const container = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({
    width: 640,
    height: 260,
  })
  useLayoutEffect(() => {
    const element = container.current
    if (!element) {
      return
    }
    const frame = { id: 0 }
    const measure = () => {
      const box = element.getBoundingClientRect()
      if (box.width > 0 && box.height > 0) {
        setSize({ width: box.width, height: box.height })
      }
    }
    measure()
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame.id)
      frame.id = requestAnimationFrame(measure)
    })
    observer.observe(element)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame.id)
    }
  }, [])
  const selected = data.children.filter(
    (child) =>
      !settings.kidId || child.id === settings.kidId,
  )
  const metric = settings.metric ?? "daily"
  const selectedTasks = selected.flatMap((child) =>
    child.tasks
      .filter(
        (task) =>
          !settings.taskKey ||
          task.key === settings.taskKey,
      )
      .map((task) => ({ child, task })),
  )
  const isByTask = metric === "task-points"
  const labels = isByTask
    ? selectedTasks.map(
        (entry) =>
          `${entry.child.name}: ${entry.task.name}`,
      )
    : (selected[0]?.days.map((day) => day.day) ?? [])
  const series: ChartSeries[] = isByTask
    ? [
        {
          id: "tasks",
          label: "Net points",
          values: selectedTasks.map(
            (entry) => entry.task.points,
          ),
          color: "var(--accent)",
        },
      ]
    : metric === "minutes"
      ? selectedTasks
          .filter((entry) => entry.task.minutes > 0)
          .map((entry) => ({
            id: `${entry.child.id}-${entry.task.key}`,
            label: `${entry.child.name}: ${entry.task.name}`,
            color: entry.child.color,
            values: entry.task.days.map(
              (day) => day.minutes,
            ),
          }))
      : selected.map((child) => ({
          id: child.id,
          label: child.name,
          color: child.color,
          values: child.days.map((day) =>
            metric === "cumulative"
              ? day.cumulative
              : day.net,
          ),
        }))
  const hasGoal =
    metric === "daily" && selected.length === 1
  const plotSeries = hasGoal
    ? series.concat([
        {
          id: "goal",
          label: "Daily goal",
          kind: "line",
          color: "currentColor",
          values: selected[0].days.map((day) => day.goal),
        },
      ])
    : series
  const title =
    metric === "cumulative"
      ? "Cumulative points"
      : metric === "minutes"
        ? "Task time (minutes)"
        : isByTask
          ? "Points by task"
          : "Daily points"
  const total = selected.reduce(
    (sum, child) => sum + child.totals.net,
    0,
  )
  const previous = selected.reduce(
    (sum, child) => sum + child.totals.previousNet,
    0,
  )
  return (
    <section
      class="platform-points-history"
      aria-label="Points history"
    >
      <header class="points-history-full">
        <h2>{title}</h2>
        <p>
          {data.range.fromDay} – {data.range.toDay}
          {data.range.isPartial
            ? " · Today is partial"
            : ""}
        </p>
      </header>
      {selected.length === 0 ? (
        <p>No child matches this view.</p>
      ) : (
        <>
          <p class="points-history-summary points-history-full">
            <strong>{points(total)} points</strong>
            <span>
              {points(total - previous)} vs. previous{" "}
              {data.range.dayCount} days
            </span>
            <span>
              {points(total / data.range.dayCount)} per
              calendar day
            </span>
          </p>
          <div
            class="points-history-plot points-history-full"
            ref={container}
            dangerouslySetInnerHTML={{
              __html: renderChartSvg({
                title,
                description:
                  "Calendar-day history calculated by the points service. Negative values are reversals or penalties.",
                labels,
                series: plotSeries,
                kind:
                  metric === "cumulative" ||
                  metric === "minutes"
                    ? "line"
                    : "bar",
                width: size.width,
                height: size.height,
                fontSize: Math.min(
                  24,
                  Math.max(12, size.height / 18),
                ),
              }),
            }}
          />
          <fieldset
            class="points-history-legend points-history-full"
            aria-label={`${title} legend`}
          >
            {plotSeries.slice(0, 6).map((entry, index) => (
              <span key={entry.id}>
                <i
                  style={{
                    borderTop: `3px ${index % 3 === 0 ? "solid" : index % 3 === 1 ? "dashed" : "dotted"} ${entry.color ?? "currentColor"}`,
                  }}
                />
                {entry.label}
              </span>
            ))}
            {plotSeries.length > 6 && (
              <span>+{plotSeries.length - 6} series</span>
            )}
          </fieldset>
        </>
      )}
      <div class="points-history-compact">
        <strong>{points(total)} points</strong>
        <span>
          {data.range.fromDay}–{data.range.toDay}
          {data.range.isPartial ? " · Partial" : ""}
        </span>
        <span>Chart needs more space</span>
      </div>
      <footer>
        {data.source.isFallback
          ? "Local ledger fallback"
          : data.source.name === "influxdb"
            ? "InfluxDB history"
            : "Local ledger"}{" "}
        · Updated{" "}
        {new Date(data.generatedAtMs).toLocaleString(
          "en-US",
          {
            timeZone: data.range.timezone,
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          },
        )}
      </footer>
    </section>
  )
}
