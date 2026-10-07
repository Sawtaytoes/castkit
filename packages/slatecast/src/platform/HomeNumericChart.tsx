import {
  type ChartOptions,
  renderChartSvg,
} from "@charcuterie/logic/core"
import type { ComponentType } from "preact"
import { useEffect, useState } from "preact/hooks"

export const HomeNumericChart = ({
  options,
}: {
  options: ChartOptions
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [Chart, setChart] = useState<ComponentType<
    ChartOptions & { isAnimated?: boolean }
  > | null>(null)
  const [hasFailed, setHasFailed] = useState(false)
  useEffect(() => {
    if (!isOpen || Chart) return
    const state = { isDisposed: false }
    void import("@charcuterie/logic/charts/preact")
      .then((module) => {
        if (!state.isDisposed)
          setChart(() => module.ChartPlot)
      })
      .catch(() => {
        if (!state.isDisposed) setHasFailed(true)
      })
    return () => {
      state.isDisposed = true
    }
  }, [isOpen, Chart])
  return (
    <div>
      {/* The portable shared renderer escapes every source label and color before emitting SVG. */}
      <div
        dangerouslySetInnerHTML={{
          __html: renderChartSvg(options),
        }}
      />
      <details
        class="home-chart-details"
        onToggle={(event) =>
          setIsOpen(event.currentTarget.open)
        }
      >
        <summary>Explore history</summary>
        {isOpen ? (
          <div data-chart-interactive>
            {Chart ? (
              <Chart
                {...options}
                height={280}
                isAnimated={false}
              />
            ) : (
              <p role="status">
                {hasFailed
                  ? "Chart unavailable · Summary remains above"
                  : "Loading chart…"}
              </p>
            )}
          </div>
        ) : null}
      </details>
    </div>
  )
}
