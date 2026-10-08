import type { ComponentChildren } from "preact"
import { useEffect } from "preact/hooks"
import { connect, device } from "./state.ts"
import { ViewSwipeEdges } from "./ViewSwipeEdges.tsx"

/** Keep device navigation available when a composition replaces its base view. */
export const DeviceViewNavigation = ({
  deviceId,
  viewId,
  children,
}: {
  deviceId: string
  viewId: string
  children: ComponentChildren
}) => {
  useEffect(() => connect(deviceId), [deviceId])
  const profile = device.value
  if (profile?.id !== deviceId || !profile.hasTouch)
    return <>{children}</>
  return (
    <div
      class="stage"
      data-view={viewId}
      style={{ width: "100vw", height: "100vh" }}
    >
      {children}
      <ViewSwipeEdges viewId={viewId} />
    </div>
  )
}
