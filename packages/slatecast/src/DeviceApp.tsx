import { useLayoutEffect, useState } from "preact/hooks"
import { App } from "./App.tsx"
import { DeviceViewNavigation } from "./DeviceViewNavigation.tsx"
import { readLocalDisplayTarget } from "./localDisplayTarget.ts"
import { NavigationFeedback } from "./NavigationFeedback.tsx"
import { PlatformApp } from "./platform/PlatformApp.tsx"
import { useWarmDeviceViews } from "./platform/useWarmDeviceViews.ts"
import {
  activeView,
  device,
  deviceDisplayTarget,
} from "./state.ts"

/** Keep the device socket and browser document alive across temporary compositions. */
const DeviceContent = () => {
  const profile = device.value
  const assignedTarget = deviceDisplayTarget.value
  useWarmDeviceViews(
    (profile?.externalViews ?? []).flatMap((view) => {
      const target = readLocalDisplayTarget(view)
      return target ? [target] : []
    }),
  )
  const externalIndex = /^external-view:(\d+)$/.exec(
    activeView.value,
  )?.[1]
  const requestedTarget =
    assignedTarget && profile
      ? { ...assignedTarget, deviceId: profile.id }
      : readLocalDisplayTarget(
          externalIndex === undefined
            ? undefined
            : profile?.externalViews[Number(externalIndex)],
        )
  const targetKey = JSON.stringify(requestedTarget)
  const [target, setTarget] = useState(requestedTarget)
  useLayoutEffect(() => {
    // Controller handoffs may briefly clear an override before the next one
    // arrives. Keep the mounted composition through that gap, and let a newer
    // target cancel the fallback instead of constructing a throwaway view.
    const timer = window.setTimeout(
      () => setTarget(requestedTarget),
      requestedTarget ? 0 : 160,
    )
    return () => clearTimeout(timer)
  }, [targetKey])
  if (!target || !profile) return <App />
  return (
    <DeviceViewNavigation
      deviceId={profile.id}
      viewId={target.id}
    >
      <PlatformApp
        target={target}
        isDeviceShell
        isTargetPending={
          targetKey !== JSON.stringify(target)
        }
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

/** Keep input acknowledgement mounted across both native and composed views. */
export const DeviceApp = () => (
  <>
    <DeviceContent />
    <NavigationFeedback />
  </>
)
