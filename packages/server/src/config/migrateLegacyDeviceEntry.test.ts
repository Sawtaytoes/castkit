import { describe, expect, test } from "vitest"
import { migrateLegacyDeviceEntry } from "./env.ts"

/**
 * These fixtures are the shapes actually found in the deployed
 * `castkit.config.json` on 2026-09-14, before the American-spelling rename:
 * `colourMode` of `mono` and `e6`, `colour` of `full`, and `shape` of `rect`.
 * If this file stops passing, an existing deployment stops booting.
 */
describe("migrateLegacyDeviceEntry", () => {
  test("renames colourMode and its mono value", () => {
    expect(
      migrateLegacyDeviceEntry({
        id: "eink-a615f8",
        colourMode: "mono",
      }),
    ).toEqual({
      id: "eink-a615f8",
      colorMode: "monochrome",
    })
  })

  test("renames the e6 color mode to spectra6", () => {
    expect(
      migrateLegacyDeviceEntry({ colourMode: "e6" }),
    ).toEqual({ colorMode: "spectra6" })
  })

  test("renames a browser device's colour key", () => {
    expect(
      migrateLegacyDeviceEntry({
        renderer: "browser",
        colour: "full",
      }),
    ).toEqual({ renderer: "browser", color: "full" })
  })

  test("renames the rect shape value", () => {
    expect(
      migrateLegacyDeviceEntry({ shape: "rect" }),
    ).toEqual({ shape: "rectangle" })
  })

  test("leaves square and round shapes alone", () => {
    expect(
      migrateLegacyDeviceEntry({ shape: "square" }),
    ).toEqual({ shape: "square" })
    expect(
      migrateLegacyDeviceEntry({ shape: "round" }),
    ).toEqual({ shape: "round" })
  })

  test("passes an already-migrated entry through unchanged", () => {
    const current = {
      id: "eink-a615f8",
      colorMode: "monochrome",
      shape: "rectangle",
    }

    expect(migrateLegacyDeviceEntry(current)).toEqual(
      current,
    )
  })

  test("lets the new key win when both spellings are present", () => {
    // An admin-panel write produced the new key most recently, so it is the
    // authoritative one. The stale legacy key is dropped either way.
    expect(
      migrateLegacyDeviceEntry({
        colourMode: "mono",
        colorMode: "spectra6",
      }),
    ).toEqual({ colorMode: "spectra6" })
  })

  test("drops the legacy key rather than leaving both on the object", () => {
    const migrated = migrateLegacyDeviceEntry({
      colourMode: "mono",
    })

    expect(migrated).not.toHaveProperty("colourMode")
  })

  test("does not invent a key that was absent", () => {
    expect(migrateLegacyDeviceEntry({ id: "x" })).toEqual({
      id: "x",
    })
  })
})
