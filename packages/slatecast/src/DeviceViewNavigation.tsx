import type { ComponentChildren } from "preact"
import { HandBackEdge } from "./HandBackEdge.tsx"
import { device } from "./state.ts"
import { ViewSwipeEdges } from "./ViewSwipeEdges.tsx"
import { ViewSwitcher } from "./ViewSwitcher.tsx"

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
      <ViewSwitcher />
      <HandBackEdge />
    </div>
  )
}
