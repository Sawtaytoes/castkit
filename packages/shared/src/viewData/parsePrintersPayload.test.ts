import { builtinContractSchemas } from "@castkit/sdk/contracts"
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

  test("an absent-entity string is absent whatever its case", () => {
    // The same absent tray arrives in two spellings from one integration: an
    // attribute renders Python's None as "None", the sensor's own state is
    // "none". The lowercase form reached the glass and printed the word `none`
    // under FILAMENT on a printer paused with no tray loaded.
    const printer = parsePrintersPayload(
      buildPayload({
        filamentText: "none",
        nozzleText: "UNKNOWN",
        problemText: "Unavailable",
      }),
    ).printers[0]

    expect(printer).not.toHaveProperty("filamentText")
    expect(printer).not.toHaveProperty("nozzleText")
    expect(printer).not.toHaveProperty("problemText")
  })

  test("a value that merely contains an absent word is kept", () => {
    // The guard is an exact match on the whole trimmed value, never a
    // substring: a real print can be called "Nonestick Jig" and a real filament
    // "Unknown Brand PLA", and neither is an absent field.
    const printer = parsePrintersPayload(
      buildPayload({
        filamentText: "Unknown Brand PLA",
        jobName: "Nonestick Jig",
      }),
    ).printers[0]

    expect(printer?.filamentText).toBe("Unknown Brand PLA")
    expect(printer?.jobName).toBe("Nonestick Jig")
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

test("inventory alpha, bands, finish, and brand survive the printer contract and browser parser", () => {
  const filament = {
    name: "PLA Translucent",
    color: "#f74e02",
    rgba: "F74E0280",
    extraColors: ["11AABB80"],
    effectType: "dual-color",
    colorName: "Orange",
    brand: "Sample Brand",
    location: "AMS 1, slot 3",
  }
  const data = builtinContractSchemas["printers.v1"].parse(
    buildPayload({
      filamentColor: "F74E0280",
      filaments: [filament],
    }),
  )
  const printer = parsePrintersPayload(data).printers[0]
  expect(printer?.filamentColor).toBe("#f74e0280")
  expect(printer?.filaments).toEqual([
    {
      ...filament,
      rgba: "f74e0280",
      extraColors: ["11aabb80"],
    },
  ])
})

test("malformed inventory colors are dropped without losing the filament's readable details", () => {
  const printer = parsePrintersPayload(
    buildPayload({
      filaments: [
        {
          name: "PLA",
          rgba: "oops",
          extraColors: ["AABBCC80", "bad", null],
          location: "Filament 1",
        },
      ],
    }),
  ).printers[0]
  expect(printer?.filaments).toEqual([
    {
      name: "PLA",
      extraColors: ["aabbcc80"],
      location: "Filament 1",
    },
  ])
})
