import type { ComponentType } from "preact"
import { useEffect, useState } from "preact/hooks"
import type { HomeDashboardProps as Props } from "./HomeDashboard.tsx"
import {
  loadHomeDashboard,
  readHomeDashboard,
} from "./viewAssets.ts"

/** Load household layout only for displays that use room or device groups. */
export const DeferredHomeDashboard = (props: Props) => {
  const [View, setView] =
    useState<ComponentType<Props> | null>(readHomeDashboard)
  useEffect(() => {
    const state = { isDisposed: false }
    void loadHomeDashboard()
      .then((View) => {
        if (!state.isDisposed) setView(() => View)
      })
      .catch(() => {
        if (!state.isDisposed)
          setView(() => () => (
            <p role="status">
              Dashboard unavailable · Refresh to retry
            </p>
          ))
      })
    return () => {
      state.isDisposed = true
    }
  }, [])
  return View ? (
    <View {...props} />
  ) : (
    <p role="status">Loading dashboard…</p>
  )
}
