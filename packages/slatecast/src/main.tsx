import { render } from "preact"
import { App } from "./App.tsx"
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
    <PlatformApp target={displayTarget} />,
    document.getElementById("app")!,
  )
} else {
  render(<App />, document.getElementById("app")!)
  connect()
}
