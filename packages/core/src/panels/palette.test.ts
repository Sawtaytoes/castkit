import { describe, expect, test } from "vitest"
import {
  blendSpectra6Palette,
  SPECTRA6_DEFAULT_PALETTE,
  SPECTRA6_DEVICE_PALETTE,
  SPECTRA6_VIVID_PALETTE,
} from "./palette.ts"

describe("blendSpectra6Palette", () => {
  test("saturation 0 returns the vivid palette", () => {
    expect(blendSpectra6Palette({ saturation: 0 })).toEqual(
      SPECTRA6_VIVID_PALETTE,
    )
  })

  test("saturation 1 returns the device palette", () => {
    expect(blendSpectra6Palette({ saturation: 1 })).toEqual(
      SPECTRA6_DEVICE_PALETTE,
    )
  })

  test("saturation 0.5 averages the two palettes per channel", () => {
    const blended = blendSpectra6Palette({
      saturation: 0.5,
    })

    // black is identical in both palettes, so it is unchanged.
    expect(blended[0]).toEqual([0, 0, 0])
    // white: device [161,164,165] blended with vivid [255,255,255].
    expect(blended[1]).toEqual([208, 210, 210])
  })

  test("the fleet default is the 0.5 blend", () => {
    expect(SPECTRA6_DEFAULT_PALETTE).toEqual(
      blendSpectra6Palette({ saturation: 0.5 }),
    )
  })
})
