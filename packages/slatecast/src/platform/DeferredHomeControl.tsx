import type { ComponentType } from "preact"
import { useEffect, useState } from "preact/hooks"
import type { HomeControlProps } from "./HomeControl.tsx"

/** Keep household controls out of the initial bundle used by small device kiosks. */
export const DeferredHomeControl = (
  props: HomeControlProps,
) => {
  const [Control, setControl] =
    useState<ComponentType<HomeControlProps> | null>(null)
  const [hasFailed, setHasFailed] = useState(false)
  useEffect(() => {
    const state = { isDisposed: false }
    void import("./HomeControl.tsx")
      .then((module) => {
        if (!state.isDisposed)
          setControl(() => module.HomeControl)
      })
      .catch(() => {
        if (!state.isDisposed) setHasFailed(true)
      })
    return () => {
      state.isDisposed = true
    }
  }, [])
  return Control ? (
    <Control {...props} />
  ) : (
    <p role="status">
      {hasFailed
        ? "Controls could not load · Refresh to retry"
        : "Loading controls…"}
    </p>
  )
}
