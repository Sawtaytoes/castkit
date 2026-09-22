import { describe, expect, test } from "vitest"
import { buildDevicePageHtml } from "./pages.ts"

/**
 * The page shell is the FIRST paint. A kiosk panel holds its page for weeks, so
 * a rule keyed on a panel fact has to be able to read that fact before the
 * bundle has parsed — which is what these attributes are for.
 */
const buildSnapshot = ({
  orientation = 0,
  pixelGrid = "rgb-stripe",
  repaint = "instant",
}: {
  orientation?: 0 | 90 | 180 | 270
  pixelGrid?: "none" | "rgb-stripe" | "bgr-stripe"
  repaint?: "instant" | "fast" | "slow" | "super-slow"
} = {}) =>
  ({
    type: "snapshot",
    device: {
      id: "dev",
      label: "Dev",
      width: 720,
      height: 720,
      shape: "square",
      hasTouch: true,
      color: "full",
      delivery: "live-browser",
      repaint,
      hasPanelDithering: false,
      pixelGrid,
      externalViews: [],
      views: [
        { name: "Now Playing", clientId: "now-playing" },
      ],
    },
    settings: {
      orientation,
      theme: "Dark",
      photoIntervalMinutes: 10,
    },
    view: "now-playing",
    data: {},
  }) as const

describe("buildDevicePageHtml", () => {
  test("stamps the Axis A panel facts on the root element", () => {
    const html = buildDevicePageHtml({
      snapshot: buildSnapshot({ repaint: "fast" }),
    })

    expect(html).toContain('data-repaint="fast"')
    expect(html).toContain('data-panel-dithering="false"')
    expect(html).toContain('data-pixel-grid="rgb-stripe"')
  })

  test("names the delivery and the input the model uses", () => {
    const html = buildDevicePageHtml({
      snapshot: buildSnapshot(),
    })

    expect(html).toContain('data-delivery="live-browser"')
    expect(html).toContain('data-input="touch"')
  })

  /*
   * `vw`/`vh`/`vmin` resolve against the viewport, which is the panel only
   * while the panel is hung straight. These carry the real layout box.
   */
  test("carries the layout box as custom properties", () => {
    const html = buildDevicePageHtml({
      snapshot: buildSnapshot(),
    })

    expect(html).toContain("--panel-width: 720px")
    expect(html).toContain("--panel-height: 720px")
    expect(html).toContain("--panel-min: 720px")
  })

  test("a usable stripe hung straight keeps subpixel text", () => {
    expect(
      buildDevicePageHtml({ snapshot: buildSnapshot() }),
    ).toContain('data-grayscale-text="false"')
  })

  /*
   * The derived attribute is the point of stamping one at all. Neither half of
   * this is readable from a single attribute: the panel has a stripe, and the
   * unit is hung sideways, so the stripe runs the other way from the one
   * Chromium assumes.
   */
  test("a stripe hung sideways forces grayscale text", () => {
    expect(
      buildDevicePageHtml({
        snapshot: buildSnapshot({ orientation: 90 }),
      }),
    ).toContain('data-grayscale-text="true"')
  })

  test("a panel with no stripe forces grayscale text", () => {
    expect(
      buildDevicePageHtml({
        snapshot: buildSnapshot({ pixelGrid: "none" }),
      }),
    ).toContain('data-grayscale-text="true"')
  })
})
