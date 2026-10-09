import type { ContractData } from "@castkit/sdk/contracts"
import type { ComponentType } from "preact"
import { useEffect, useState } from "preact/hooks"

type Props = {
  data: ContractData["cameras.v1"]
  settings: Record<string, unknown>
  isAlert?: boolean
  snapshots?: ContractData["cameras.v1"]
}
/** Load the camera wall only when a camera panel is present on the display. */
export const DeferredCamerasView = (props: Props) => {
  const [View, setView] =
    useState<ComponentType<Props> | null>(null)
  const [hasFailed, setHasFailed] = useState(false)
  useEffect(() => {
    const state = { isDisposed: false }
    void (
      props.isAlert
        ? import("./CameraAlertView.tsx")
        : import("./CamerasView.tsx")
    )
      .then((module) => {
        if (!state.isDisposed)
          setView(() =>
            "CameraAlertView" in module
              ? module.CameraAlertView
              : module.CamerasView,
          )
      })
      .catch(() => {
        if (!state.isDisposed) setHasFailed(true)
      })
    return () => {
      state.isDisposed = true
    }
  }, [props.isAlert])
  return View ? (
    <View {...props} />
  ) : (
    <p
      role="status"
      data-castkit-plugin-ready={String(hasFailed)}
    >
      {hasFailed
        ? "Camera view could not load · Refresh to retry"
        : "Loading cameras…"}
    </p>
  )
}
