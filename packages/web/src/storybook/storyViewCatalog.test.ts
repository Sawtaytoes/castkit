import { EXAMPLE_DEVICES } from "@castkit/core/devices/device"
import { resolveSafeArea } from "@castkit/core/panels/safeArea"
import {
  getIsBleedView,
  VIEW_NAMES,
} from "@castkit/shared/views/viewNames"
import { describe, expect, test } from "vitest"
import {
  getPanelCatalogEntry,
  PANEL_CATALOG,
  resolvePalette,
} from "./panelCatalog.ts"
import { STORY_VIEW_NAMES } from "./storyViewCatalog.tsx"

describe("storyViewCatalog", () => {
  test("covers exactly the view vocabulary the server can render", () => {
    // The guard that keeps the preview honest: add a view to VIEW_NAMES
    // without a story builder and this fails rather than silently omitting it
    // from the all-screens matrix.
    expect([...STORY_VIEW_NAMES].sort()).toEqual(
      [...VIEW_NAMES].sort(),
    )
  })
})

describe("panelCatalog", () => {
  test("every example device is previewable with a zoom", () => {
    expect(PANEL_CATALOG).toHaveLength(
      EXAMPLE_DEVICES.length,
    )
    PANEL_CATALOG.forEach(({ device, defaultZoom }) => {
      expect(defaultZoom).toBeGreaterThanOrEqual(1)
      expect(device.width).toBeGreaterThan(0)
      expect(device.height).toBeGreaterThan(0)
    })
  })

  test("the M5Paper is previewable — it is the panel with no hardware dither", () => {
    const { device } = getPanelCatalogEntry("m5paper")

    expect(device.width).toBe(540)
    expect(device.height).toBe(960)
    expect(device.colourMode).toBe("mono")
  })

  test("an unknown device id falls back to a real panel", () => {
    expect(
      getPanelCatalogEntry("no-such-device").device.id,
    ).toBe(PANEL_CATALOG[0].device.id)
  })

  test("mono panels ignore the E6 palette variant", () => {
    const vividOnMono = resolvePalette({
      colourMode: "mono",
      paletteVariant: "vivid",
    })
    const deviceOnMono = resolvePalette({
      colourMode: "mono",
      paletteVariant: "device",
    })

    expect(vividOnMono).toEqual(deviceOnMono)
    expect(vividOnMono).toHaveLength(2)
  })

  test("the E6 variants are genuinely different palettes", () => {
    const vivid = resolvePalette({
      colourMode: "e6",
      paletteVariant: "vivid",
    })
    const device = resolvePalette({
      colourMode: "e6",
      paletteVariant: "device",
    })

    expect(vivid).toHaveLength(6)
    expect(vivid).not.toEqual(device)
  })
})

describe("crop insets in the preview", () => {
  test("a bleed view keeps the whole panel", () => {
    // PanelStage passes `undefined` for bleed views; this is that contract.
    expect(getIsBleedView("Photo Frame")).toBe(true)

    const { contentWidth, contentHeight, hasInset } =
      resolveSafeArea({
        width: 800,
        height: 480,
        safeAreaInset: undefined,
      })

    expect(contentWidth).toBe(800)
    expect(contentHeight).toBe(480)
    expect(hasInset).toBe(false)
  })

  test("a text view shrinks to the safe box", () => {
    expect(getIsBleedView("Clock (Agenda)")).toBe(false)

    const { contentWidth, contentHeight } = resolveSafeArea(
      {
        width: 800,
        height: 480,
        safeAreaInset: {
          top: 40,
          right: 40,
          bottom: 40,
          left: 40,
        },
      },
    )

    expect(contentWidth).toBe(720)
    expect(contentHeight).toBe(400)
  })
})
