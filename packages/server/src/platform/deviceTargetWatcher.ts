import type { Platform } from "./platform.ts"

/**
 * Tell each display when what it shows through the platform changes: an
 * assigned screen appears or goes, or a temporary view starts or ends.
 *
 * A browser display receives its new target over the device socket and
 * switches components inside the same document, preserving frame capture. An image display that leaves the
 * platform needs one frame of its own view, which the platform scheduler no
 * longer draws. An image display joining the platform needs nothing here:
 * the scheduler sees the new target on its next tick.
 */
export const watchDeviceTargets = ({
  platform,
  browserDeviceIds,
  imageDeviceIds,
  onBrowserTargetChanged,
  onImageTargetRemoved,
}: {
  platform: Pick<
    Platform,
    "getDeviceTarget" | "store" | "subscribe"
  >
  browserDeviceIds: readonly string[]
  imageDeviceIds: readonly string[]
  onBrowserTargetChanged: (deviceId: string) => void
  onImageTargetRemoved: (deviceId: string) => void
}) => {
  const imageIds = new Set(imageDeviceIds)
  const read = () =>
    Object.fromEntries(
      Array.from(
        new Set([
          ...browserDeviceIds,
          ...imageDeviceIds,
          ...Object.keys(
            platform.store.get().deviceScreens,
          ),
        ]),
      ).map((deviceId) => [
        deviceId,
        JSON.stringify(
          platform.getDeviceTarget(deviceId) ?? null,
        ),
      ]),
    )
  const targets = { value: read() }
  return platform.subscribe(() => {
    const current = read()
    Object.entries(current).forEach(
      ([deviceId, target]) => {
        if (target === targets.value[deviceId]) return
        if (!imageIds.has(deviceId)) {
          onBrowserTargetChanged(deviceId)
        } else if (target === "null") {
          onImageTargetRemoved(deviceId)
        }
      },
    )
    targets.value = current
  })
}
