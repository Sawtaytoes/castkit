import { describe, expect, test } from "vitest"
import { parsePrintersPayload } from "./parsers.ts"

const buildPayload = (
  overrides: Record<string, unknown> = {},
) => ({
  printers: [
    {
      id: "magi",
      name: "Magi",
      jobName: "Front_Frame_-_Matte_Black_-_Magi",
      percent: 41,
      state: "printing",
      currentLayer: 32,
      totalLayers: 334,
      remainingMinutes: 128,
      ...overrides,
    },
  ],
})

describe("parsePrintersPayload", () => {
  test("reads a full printer", () => {
    expect(
      parsePrintersPayload(
        buildPayload({
          filamentColor: "1C1C1CFF",
          finishAt: "2026-09-23T21:30:00.000Z",
          nozzleText: "0.4 mm hardened steel",
        }),
      ).printers[0],
    ).toEqual({
      id: "magi",
      name: "Magi",
      jobName: "Front_Frame_-_Matte_Black_-_Magi",
      percent: 41,
      state: "printing",
      currentLayer: 32,
      totalLayers: 334,
      remainingMinutes: 128,
      filamentColor: "#1c1c1c",
      finishAtMs: Date.parse("2026-09-23T21:30:00.000Z"),
      nozzleText: "0.4 mm hardened steel",
    })
  })

  test("an empty list is a real answer, not a missing one", () => {
    expect(parsePrintersPayload({ printers: [] })).toEqual({
      printers: [],
    })
  })

  test("a payload that is not an object reads as nothing printing", () => {
    expect(parsePrintersPayload("offline")).toEqual({
      printers: [],
    })
  })

  test.each([
    ["no id", { id: "" }],
    ["no name", { name: "  " }],
    ["a state nobody acts on", { state: "idle" }],
  ])("drops a printer with %s", (_label, overrides: Record<
    string,
    unknown
  >) => {
    expect(
      parsePrintersPayload(buildPayload(overrides))
        .printers,
    ).toHaveLength(0)
  })

  test("an out-of-range percentage is clamped", () => {
    expect(
      parsePrintersPayload(buildPayload({ percent: 140 }))
        .printers[0]?.percent,
    ).toBe(100)
    expect(
      parsePrintersPayload(buildPayload({ percent: -3 }))
        .printers[0]?.percent,
    ).toBe(0)
  })

  test("Home Assistant's absent-entity strings are absent fields", () => {
    const printer = parsePrintersPayload(
      buildPayload({
        currentLayer: "unknown",
        filamentText: "unavailable",
        nozzleText: "None",
        problemText: "",
      }),
    ).printers[0]

    expect(printer).not.toHaveProperty("currentLayer")
    expect(printer).not.toHaveProperty("filamentText")
    expect(printer).not.toHaveProperty("nozzleText")
    expect(printer).not.toHaveProperty("problemText")
  })

  test("a filament color that is not hex is dropped rather than painted", () => {
    expect(
      parsePrintersPayload(
        buildPayload({ filamentColor: "matte black" }),
      ).printers[0],
    ).not.toHaveProperty("filamentColor")
  })

  test("numbers arriving as strings still read", () => {
    expect(
      parsePrintersPayload(
        buildPayload({
          percent: "41",
          remainingMinutes: "128.4",
        }),
      ).printers[0],
    ).toMatchObject({ percent: 41, remainingMinutes: 128 })
  })
})
