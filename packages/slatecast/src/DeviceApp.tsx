import { App } from "./App.tsx"
import { DeviceViewNavigation } from "./DeviceViewNavigation.tsx"
import { readLocalDisplayTarget } from "./localDisplayTarget.ts"
import { PlatformApp } from "./platform/PlatformApp.tsx"
import {
  activeView,
  device,
  deviceDisplayTarget,
} from "./state.ts"

/** Keep the device socket and browser document alive across temporary compositions. */
export const DeviceApp = () => {
  const profile = device.value
  const assignedTarget = deviceDisplayTarget.value
  const externalIndex = /^external-view:(\d+)$/.exec(
    activeView.value,
  )?.[1]
  const target =
    assignedTarget && profile
      ? { ...assignedTarget, deviceId: profile.id }
      : readLocalDisplayTarget(
          externalIndex === undefined
            ? undefined
            : profile?.externalViews[Number(externalIndex)],
        )
  if (!target || !profile) return <App />
  return (
    <DeviceViewNavigation
      deviceId={profile.id}
      viewId={target.id}
    >
      <PlatformApp
        target={target}
        isDeviceShell
        deviceProperties={{
          repaint: profile.repaint,
          delivery:
            profile.delivery === "live-browser"
              ? "browser"
              : "image",
          width: profile.width,
          height: profile.height,
          hasTouch: profile.hasTouch,
          hasViewDrawer: profile.hasViewDrawer,
          contrast: profile.contrast,
        }}
      />
    </DeviceViewNavigation>
  )
}
