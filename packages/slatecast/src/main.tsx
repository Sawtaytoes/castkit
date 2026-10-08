import { render } from "preact"
import { DeviceApp } from "./DeviceApp.tsx"
import { DeviceViewNavigation } from "./DeviceViewNavigation.tsx"
import { PlatformApp } from "./platform/PlatformApp.tsx"
import {
  readDisplayTarget,
  readInlineDisplayTarget,
} from "./platform/protocol.ts"
import { connect } from "./state.ts"
import "./styles.css"

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
  connect()
}
