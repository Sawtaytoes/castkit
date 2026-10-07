import type { ContractData } from "@castkit/sdk/contracts"
import type { ComponentType } from "preact"
import { useEffect, useState } from "preact/hooks"

type Props = {
  data: ContractData["cameras.v1"]
  settings: Record<string, unknown>
}
/** Load the camera wall only when a camera panel is present on the display. */
export const DeferredCamerasView = (props: Props) => {
  const [View, setView] =
    useState<ComponentType<Props> | null>(null)
  const [hasFailed, setHasFailed] = useState(false)
  useEffect(() => {
    const state = { isDisposed: false }
    void import("./CamerasView.tsx")
      .then((module) => {
        if (!state.isDisposed)
          setView(() => module.CamerasView)
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
        ? "Camera view could not load · Refresh to retry"
        : "Loading cameras…"}
    </p>
  )
}
