import {
  type ChartOptions,
  renderChartSvg,
} from "@charcuterie/logic/core"
import type { ComponentType } from "preact"
import { useEffect, useState } from "preact/hooks"
import { useDisplayProperties } from "./displayProperties.ts"

export const HomeNumericChart = ({
  options,
  isCompact = false,
}: {
  options: ChartOptions
  isCompact?: boolean
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const { isInteractive } = useDisplayProperties()
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
    <div
      class="home-numeric-chart"
      data-compact={String(isCompact)}
    >
      {/* The portable shared renderer escapes every source label and color before emitting SVG. */}
      <div
        class="home-chart-preview"
        dangerouslySetInnerHTML={{
          __html: renderChartSvg(
            isCompact
              ? {
                  ...options,
                  isSparkline: true,
                  width: 240,
                  height: 40,
                }
              : options,
          ),
        }}
      />
      {!isCompact || isInteractive ? (
        <details
          class="home-chart-details"
          onToggle={(event) =>
            setIsOpen(event.currentTarget.open)
          }
        >
          <summary
            aria-label={
              isCompact
                ? `Explore ${options.title} history`
                : undefined
            }
            title={
              isCompact ? "Explore history" : undefined
            }
          >
            {isCompact ? (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                aria-hidden="true"
              >
                <path d="M3 11a9 9 0 1 1 2 6M3 5v6h6M12 7v5l3 2" />
              </svg>
            ) : (
              "Explore history"
            )}
          </summary>
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
      ) : null}
    </div>
  )
}
