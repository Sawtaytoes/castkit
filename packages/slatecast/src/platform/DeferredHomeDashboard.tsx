import type { ComponentType } from "preact"
import { useEffect, useState } from "preact/hooks"

import type { HomeDashboardProps as Props } from "./HomeDashboard.tsx"

/** Load household layout only for displays that use room or device groups. */
export const DeferredHomeDashboard = (props: Props) => {
  const [View, setView] =
    useState<ComponentType<Props> | null>(null)
  useEffect(() => {
    const state = { isDisposed: false }
    void import("./HomeDashboard.tsx")
      .then((module) => {
        if (!state.isDisposed)
          setView(() => module.HomeDashboard)
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
