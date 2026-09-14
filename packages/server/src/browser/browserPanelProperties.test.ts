import { describe, expect, test } from "vitest"
import type { BrowserDeviceConfig } from "../config/env.ts"
import { resolveBrowserPanelProperties } from "./browserPanelProperties.ts"

/**
 * The shape a devices file written before 2026-09-14 produces: a browser
 * device with none of the three Axis A facts on it. Every deployed config is
 * this, so the derived values are what the fleet actually runs on.
 */
const buildLegacyEntry = (
  overrides: Partial<BrowserDeviceConfig> = {},
) =>
  ({
    color: "full",
    hasPanelDithering: undefined,
    pixelGrid: undefined,
    repaint: undefined,
    ...overrides,
  }) as BrowserDeviceConfig

describe("resolveBrowserPanelProperties", () => {
  test("derives every fact for a config that declares none", () => {
    expect(
      resolveBrowserPanelProperties(buildLegacyEntry()),
    ).toEqual({
      delivery: "live-browser",
      repaint: "instant",
      hasPanelDithering: false,
      pixelGrid: "rgb-stripe",
    })
  })

  test("a reduced-ink panel gets no stripe", () => {
    for (const color of [
      "monochrome",
      "grayscale",
      "spectra6",
    ] as const) {
      expect(
        resolveBrowserPanelProperties(
          buildLegacyEntry({ color }),
        ).pixelGrid,
      ).toBe("none")
    }
  })

  test("an explicit value wins over the derived one", () => {
    expect(
      resolveBrowserPanelProperties(
        buildLegacyEntry({
          hasPanelDithering: true,
          pixelGrid: "bgr-stripe",
          repaint: "fast",
        }),
      ),
    ).toEqual({
      delivery: "live-browser",
      repaint: "fast",
      hasPanelDithering: true,
      pixelGrid: "bgr-stripe",
    })
  })

  /*
   * `false` and `"none"` are the values a `??` chain is easiest to get wrong
   * on, because both read as "nothing here" to a loose check. An explicit
   * `hasPanelDithering: false` must not fall through to the default, even
   * though the default is also `false` — the day the default changes, this is
   * the test that catches it.
   */
  test("an explicit falsy value is not treated as absent", () => {
    expect(
      resolveBrowserPanelProperties(
        buildLegacyEntry({
          color: "full",
          hasPanelDithering: false,
          pixelGrid: "none",
        }),
      ),
    ).toEqual({
      delivery: "live-browser",
      repaint: "instant",
      hasPanelDithering: false,
      pixelGrid: "none",
    })
  })
})
