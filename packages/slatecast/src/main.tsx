import { render } from "preact"
import { DeviceApp } from "./DeviceApp.tsx"
import { DeviceViewNavigation } from "./DeviceViewNavigation.tsx"
import { PlatformApp } from "./platform/PlatformApp.tsx"
import {
  readDisplayTarget,
  readInlineDisplayTarget,
} from "./platform/protocol.ts"
import { connect } from "./state.ts"
import {
  getIsTouchPointerFallbackRequired,
  installTouchPointerFallback,
} from "./touchPointerFallback.ts"
import "./styles.css"

if (getIsTouchPointerFallbackRequired()) {
  installTouchPointerFallback()
}

const routeTarget =
  readInlineDisplayTarget() ??
  readDisplayTarget(window.location.pathname)
const queryDeviceId = new URLSearchParams(
  window.location.search,
).get("device")
const displayTarget =
  routeTarget && queryDeviceId
    ? { ...routeTarget, deviceId: queryDeviceId }
    : routeTarget
if (displayTarget) {
  render(
    displayTarget.deviceId ? (
      <DeviceViewNavigation
        deviceId={displayTarget.deviceId}
        viewId={displayTarget.id}
      >
        <PlatformApp target={displayTarget} />
      </DeviceViewNavigation>
    ) : (
      <PlatformApp target={displayTarget} />
    ),
    document.getElementById("app")!,
  )
  if (displayTarget.deviceId)
    connect(displayTarget.deviceId)
} else {
  render(<DeviceApp />, document.getElementById("app")!)
  // A capture page renders one view from its inlined snapshot and never
  // registers as the panel: the server uses it to render stream frames ahead.
  if (
    !new URLSearchParams(window.location.search).has(
      "capture",
    )
  )
    connect()
}
