import type { ChartOptions } from "@charcuterie/logic/core"
import type { ComponentType } from "preact"
import { useEffect, useState } from "preact/hooks"

type Props = { options: ChartOptions }

/** Load the shared numeric renderer only for a household chart panel. */
export const DeferredHomeNumericChart = (props: Props) => {
  const [View, setView] =
    useState<ComponentType<Props> | null>(null)
  const [hasFailed, setHasFailed] = useState(false)
  useEffect(() => {
    const state = { isDisposed: false }
    void import("./HomeNumericChart.tsx")
      .then((module) => {
        if (!state.isDisposed)
          setView(() => module.HomeNumericChart)
      })
      .catch(() => {
        if (!state.isDisposed) setHasFailed(true)
      })
    return () => {
      state.isDisposed = true
    }
  }, [])
  return View ? (
    <View {...props} />
  ) : (
    <p role="status">
      {hasFailed
        ? "Chart could not load · Refresh to retry"
        : "Loading chart…"}
    </p>
  )
}
