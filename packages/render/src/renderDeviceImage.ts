import type { DeviceMetadata } from "@inkcast/core/devices/device"
import type { DitherAdjustments } from "@inkcast/core/pipeline/dither"
import { ditherToPanel } from "@inkcast/core/pipeline/dither"
import type { ReactElement } from "react"
import type { RenderEngine } from "./engine.ts"

/**
 * The core server primitive: turn a view + a device into the exact panel-ready
 * PNG that device draws. Composes the two Phase-0 halves — render the view
 * supersampled with the given engine, then dither it to the device's palette
 * using that device's registered profile (algorithm, supersample, rotation).
 * Optional `adjustments` (brightness/saturation, 1 = neutral) pass through to
 * the dither pipeline so the server can expose them as Home Assistant knobs.
 *
 * The engine is passed in (not created here) so the caller reuses one browser
 * across many renders instead of paying the launch cost per image.
 */
export const renderDeviceImage = async ({
  engine,
  element,
  device,
  adjustments,
}: {
  engine: RenderEngine
  element: ReactElement
  device: DeviceMetadata
  adjustments?: DitherAdjustments
}): Promise<Buffer> => {
  const supersampledPng = await engine.render({
    element,
    width: device.width,
    height: device.height,
    supersampleFactor:
      device.ditherProfile.supersampleFactor,
  })

  return ditherToPanel({
    imageBuffer: supersampledPng,
    width: device.width,
    height: device.height,
    palette: device.palette,
    algorithm: device.ditherProfile.algorithm,
    rotation: device.rotation,
    adjustments,
  })
}
