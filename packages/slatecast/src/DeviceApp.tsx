import { App } from "./App.tsx"
import { DeviceViewNavigation } from "./DeviceViewNavigation.tsx"
import { PlatformApp } from "./platform/PlatformApp.tsx"
import { device, deviceDisplayTarget } from "./state.ts"

/** Keep the device socket and browser document alive across temporary compositions. */
export const DeviceApp = () => {
  const target = deviceDisplayTarget.value
  const profile = device.value
  if (!target || !profile) return <App />
  return (
    <DeviceViewNavigation
      deviceId={profile.id}
      viewId={target.id}
    >
      <PlatformApp
        key={`${target.kind}:${target.id}`}
        target={{ ...target, deviceId: profile.id }}
        isDeviceShell
      />
    </DeviceViewNavigation>
  )
}
