import type { DeviceMetadata } from "@castkit/core/devices/device"
import type { SafeAreaInset } from "@castkit/core/panels/safeArea"
import { resolveSafeArea } from "@castkit/core/panels/safeArea"
import type {
  DitherAdjustments,
  FullColourEncoding,
} from "@castkit/core/pipeline/dither"
import { ditherToPanel } from "@castkit/core/pipeline/dither"
import type { ReactElement } from "react"
import sharp from "sharp"
import type { RenderEngine } from "./engine.ts"

/**
 * The core server primitive: turn a view + a device into the exact panel-ready
 * PNG that device draws. Composes the two Phase-0 halves — render the view
 * supersampled with the given engine, then dither it to the device's palette
 * using that device's registered profile (algorithm, supersample, rotation).
 * Optional `adjustments` (brightness/saturation, 1 = neutral) pass through to
 * the dither pipeline so the server can expose them as Home Assistant knobs.
 *
 * When `safeAreaInset` is set the view is laid out in the smaller safe box
 * (so its text reflows/sizes to what stays visible) and composited onto a
 * full-size white canvas at the inset offset before dithering.
 *
 * The engine is passed in (not created here) so the caller reuses one browser
 * across many renders instead of paying the launch cost per image.
 */
export const renderDeviceImage = async ({
  engine,
  element,
  device,
  adjustments,
  safeAreaInset,
  fullColourEncoding,
}: {
  engine: RenderEngine
  element: ReactElement
  device: DeviceMetadata
  adjustments?: DitherAdjustments
  safeAreaInset?: SafeAreaInset
  fullColourEncoding?: FullColourEncoding
}): Promise<Buffer> => {
  const supersampleFactor =
    device.ditherProfile.supersampleFactor
  const { inset, hasInset, contentWidth, contentHeight } =
    resolveSafeArea({
      width: device.width,
      height: device.height,
      safeAreaInset,
    })

  const supersampledPng = await engine.render({
    element,
    width: hasInset ? contentWidth : device.width,
    height: hasInset ? contentHeight : device.height,
    supersampleFactor,
  })

  // Place the inset render on a full-size white canvas (both supersampled) so
  // the mat-covered margin is blank, then dither the whole panel uniformly.
  const framedPng = hasInset
    ? await sharp({
        create: {
          width: device.width * supersampleFactor,
          height: device.height * supersampleFactor,
          channels: 4,
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        },
      })
        .composite([
          {
            input: supersampledPng,
            left: inset.left * supersampleFactor,
            top: inset.top * supersampleFactor,
          },
        ])
        .png()
        .toBuffer()
    : supersampledPng

  return ditherToPanel({
    imageBuffer: framedPng,
    width: device.width,
    height: device.height,
    palette: device.palette,
    algorithm: device.ditherProfile.algorithm,
    rotation: device.rotation,
    adjustments,
    ...(fullColourEncoding ? { fullColourEncoding } : {}),
  })
}
