import type { SpoolsData } from "@castkit/shared/viewData/types"

/**
 * Fixture data for the Filament Spool Scale view: a scale, a tag on the
 * reader, an inventory and three printers' AMS trays, exactly as the server
 * pushes them on the `spools` message.
 *
 * Every spool here is INVENTED. The names are products a filament shop sells,
 * not the household's inventory; the printer names are the ones the Printer
 * Status fixtures already use. The set covers every swatch treatment the view
 * draws: a plain color, a translucent one, galaxy specks, marble veins, a
 * silk sheen, and two- and three-color bands.
 */

type Spool = SpoolsData["spools"][number]
type Printer = SpoolsData["printers"][number]
type AmsUnit = Printer["ams"][number]
type AmsTray = AmsUnit["trays"][number]

/** The spool the matched-tag stories and tests put on the reader. */
export const ASH_GRAY_SPOOL: Spool = {
  id: "spool-ash-gray",
  brand: "Bambu Lab",
  material: "PLA",
  subtype: "Matte",
  colorName: "Ash Gray",
  rgba: "9B9EA0FF",
  labelWeightGrams: 1_000,
  coreWeightGrams: 250,
  remainingGrams: 159,
  lastScaleGrams: 409,
  tagUid: "A1B2C3D4",
  tagType: "Bambu",
  trayUuid: "0f2a5c1e9b7d4a3c8e6f1b2d3c4a5e6f",
  location: {
    printerId: "quadrahedron",
    printerName: "Quadrahedron",
    amsId: 0,
    trayId: 1,
  },
}

/** A translucent color: alpha below `FF`, so the swatch draws a checkerboard. */
export const TRANSLUCENT_SPOOL: Spool = {
  id: "spool-translucent-gray",
  brand: "Bambu Lab",
  material: "PETG",
  subtype: "Translucent",
  colorName: "Translucent Gray",
  rgba: "8E8E8E80",
  labelWeightGrams: 1_000,
  coreWeightGrams: 250,
  remainingGrams: 780,
}

export const GALAXY_SPOOL: Spool = {
  id: "spool-galaxy-black",
  brand: "Polymaker",
  material: "Panchroma",
  subtype: "Galaxy",
  colorName: "Galaxy Black",
  rgba: "161617FF",
  effectType: "galaxy",
  labelWeightGrams: 1_000,
  coreWeightGrams: 137,
  remainingGrams: 940,
  tagUid: "5E6F7A8B",
  tagType: "NTAG215",
}

export const DUAL_COLOR_SPOOL: Spool = {
  id: "spool-blue-yellow",
  brand: "Inland",
  material: "PLA",
  subtype: "Silk",
  colorName: "Blue-Yellow",
  rgba: "044482FF",
  extraColors: ["E8C547FF"],
  effectType: "dual-color",
  labelWeightGrams: 1_000,
  coreWeightGrams: 142,
  remainingGrams: 512,
}

/** The whole inventory, in the order the dashboard lists it. */
export const INVENTORY: Spool[] = [
  {
    id: "spool-marble-white",
    brand: "Polymaker",
    material: "Panchroma",
    subtype: "Marble",
    colorName: "Marble White",
    rgba: "D7D4DAFF",
    effectType: "marble",
    labelWeightGrams: 1_000,
    coreWeightGrams: 137,
    remainingGrams: 1_000,
    tagUid: "1A2B3C4D",
    tagType: "NTAG215",
  },
  GALAXY_SPOOL,
  {
    id: "spool-silk-silver",
    brand: "Inland",
    material: "PLA",
    subtype: "Silk",
    colorName: "Silk Silver",
    rgba: "8A8F92FF",
    effectType: "silk",
    labelWeightGrams: 1_000,
    coreWeightGrams: 210,
    remainingGrams: 330,
    tagUid: "2B3C4D5E",
    tagType: "NTAG215",
  },
  DUAL_COLOR_SPOOL,
  {
    id: "spool-black-white",
    brand: "Inland",
    material: "PLA",
    subtype: "Dual Matte",
    colorName: "Matte Black-White",
    rgba: "000000FF",
    extraColors: ["FFFFFFFF"],
    effectType: "dual-color",
    labelWeightGrams: 1_000,
    coreWeightGrams: 142,
    remainingGrams: 870,
  },
  {
    id: "spool-tri-color",
    brand: "Inland",
    material: "PLA",
    subtype: "Silk",
    colorName: "Mystic Blue Orange Green",
    rgba: "044482FF",
    extraColors: ["E07A1FFF", "2E9E4AFF"],
    effectType: "tri-color",
    labelWeightGrams: 1_000,
    coreWeightGrams: 142,
    remainingGrams: 1_000,
    tagUid: "3C4D5E6F",
    tagType: "NTAG215",
  },
  ASH_GRAY_SPOOL,
  {
    id: "spool-apple-green",
    brand: "Bambu Lab",
    material: "PLA",
    subtype: "Matte",
    colorName: "Apple Green",
    rgba: "C2E189FF",
    labelWeightGrams: 1_000,
    coreWeightGrams: 250,
    remainingGrams: 620,
    tagUid: "4D5E6F7A",
    tagType: "Bambu",
  },
  TRANSLUCENT_SPOOL,
]

const readTray = ({
  id,
  material,
  subtype,
  rgba,
  remainPercent,
  spoolId,
}: {
  id: number
  material: string
  subtype: string
  rgba: string
  remainPercent: number
  spoolId?: string
}): AmsTray => ({
  id,
  state: "read",
  material,
  subtype,
  rgba,
  remainPercent,
  spoolId,
})

const untaggedTray = ({
  id,
  material,
  rgba,
}: {
  id: number
  material: string
  rgba: string
}): AmsTray => ({
  id,
  state: "untagged",
  material,
  rgba,
})

const emptyTray = (id: number): AmsTray => ({
  id,
  state: "empty",
})

/**
 * The printer the assign stories walk through: one unit with two empty slots,
 * one with two spools the AMS cannot read, and one that is full.
 */
export const FOOPIE_AMS: AmsUnit[] = [
  {
    id: 0,
    label: "AMS 1",
    humidityPercent: 13,
    trays: [
      readTray({
        id: 0,
        material: "PLA",
        subtype: "Matte",
        rgba: "A3D8E1FF",
        remainPercent: 18,
      }),
      readTray({
        id: 1,
        material: "PLA",
        subtype: "Matte",
        rgba: "042F56FF",
        remainPercent: 100,
      }),
      emptyTray(2),
      emptyTray(3),
    ],
  },
  {
    id: 1,
    label: "AMS 2",
    humidityPercent: 19,
    trays: [
      readTray({
        id: 0,
        material: "PLA",
        subtype: "Matte",
        rgba: "FFFFFFFF",
        remainPercent: 15,
      }),
      untaggedTray({
        id: 1,
        material: "PLA",
        rgba: "BCBCBCFF",
      }),
      readTray({
        id: 2,
        material: "PLA",
        subtype: "Matte",
        rgba: "D3B7A7FF",
        remainPercent: 100,
      }),
      untaggedTray({
        id: 3,
        material: "PETG",
        rgba: "8E8E8E80",
      }),
    ],
  },
  {
    id: 2,
    label: "AMS 3",
    humidityPercent: 17,
    trays: [
      readTray({
        id: 0,
        material: "PLA",
        subtype: "Basic",
        rgba: "BECF00FF",
        remainPercent: 4,
      }),
      readTray({
        id: 1,
        material: "PLA",
        subtype: "Basic",
        rgba: "000000FF",
        remainPercent: 100,
      }),
      readTray({
        id: 2,
        material: "PLA",
        subtype: "Matte",
        rgba: "DE4343FF",
        remainPercent: 83,
      }),
      readTray({
        id: 3,
        material: "PLA",
        subtype: "Basic",
        rgba: "482960FF",
        remainPercent: 15,
      }),
    ],
  },
]

const MAGI_AMS: AmsUnit[] = [
  {
    id: 0,
    label: "AMS 1",
    humidityPercent: 11,
    trays: [
      readTray({
        id: 0,
        material: "PLA",
        subtype: "Basic",
        rgba: "1C1C1CFF",
        remainPercent: 62,
      }),
      readTray({
        id: 1,
        material: "PLA",
        subtype: "Matte",
        rgba: "F4F4F4FF",
        remainPercent: 40,
      }),
      untaggedTray({
        id: 2,
        material: "PLA",
        rgba: "6B8E23FF",
      }),
      readTray({
        id: 3,
        material: "PLA",
        subtype: "Basic",
        rgba: "C12E1FFF",
        remainPercent: 91,
      }),
    ],
  },
  {
    id: 1,
    label: "AMS 2",
    humidityPercent: 12,
    trays: [
      readTray({
        id: 0,
        material: "PETG",
        subtype: "HF",
        rgba: "1F6FB2FF",
        remainPercent: 55,
      }),
      readTray({
        id: 1,
        material: "PETG",
        subtype: "HF",
        rgba: "E4E4E4FF",
        remainPercent: 77,
      }),
      readTray({
        id: 2,
        material: "PLA",
        subtype: "Basic",
        rgba: "FFB300FF",
        remainPercent: 23,
      }),
      readTray({
        id: 3,
        material: "PLA",
        subtype: "Basic",
        rgba: "8C4A2FFF",
        remainPercent: 100,
      }),
    ],
  },
  {
    id: 2,
    label: "AMS 3",
    humidityPercent: 14,
    trays: [
      readTray({
        id: 0,
        material: "PLA",
        subtype: "Matte",
        rgba: "2D5DA1FF",
        remainPercent: 70,
      }),
      readTray({
        id: 1,
        material: "PLA",
        subtype: "Matte",
        rgba: "D9D9D9FF",
        remainPercent: 9,
      }),
      readTray({
        id: 2,
        material: "PLA",
        subtype: "Basic",
        rgba: "3CB371FF",
        remainPercent: 48,
      }),
      readTray({
        id: 3,
        material: "PLA",
        subtype: "Basic",
        rgba: "F5F5F5FF",
        remainPercent: 100,
      }),
    ],
  },
]

const QUADRAHEDRON_AMS: AmsUnit[] = [
  {
    id: 0,
    label: "AMS 1",
    humidityPercent: 10,
    trays: [
      readTray({
        id: 0,
        material: "PLA",
        subtype: "Basic",
        rgba: "0A2989FF",
        remainPercent: 66,
      }),
      readTray({
        id: 1,
        material: "PLA",
        subtype: "Matte",
        rgba: "9B9EA0FF",
        remainPercent: 16,
        spoolId: ASH_GRAY_SPOOL.id,
      }),
      readTray({
        id: 2,
        material: "PLA",
        subtype: "Basic",
        rgba: "FFFFFFFF",
        remainPercent: 34,
      }),
      readTray({
        id: 3,
        material: "PLA",
        subtype: "Basic",
        rgba: "E4BD68FF",
        remainPercent: 88,
      }),
    ],
  },
  {
    id: 1,
    label: "AMS 2",
    humidityPercent: 12,
    trays: [
      readTray({
        id: 0,
        material: "PLA",
        subtype: "Basic",
        rgba: "00AE42FF",
        remainPercent: 50,
      }),
      readTray({
        id: 1,
        material: "PLA",
        subtype: "Basic",
        rgba: "BB3D43FF",
        remainPercent: 72,
      }),
      readTray({
        id: 2,
        material: "PLA",
        subtype: "Matte",
        rgba: "5B6E4AFF",
        remainPercent: 100,
      }),
      readTray({
        id: 3,
        material: "PLA",
        subtype: "Matte",
        rgba: "F0E68CFF",
        remainPercent: 27,
      }),
    ],
  },
  {
    id: 2,
    label: "AMS 3",
    humidityPercent: 15,
    trays: [
      readTray({
        id: 0,
        material: "PLA",
        subtype: "Basic",
        rgba: "000000FF",
        remainPercent: 95,
      }),
      readTray({
        id: 1,
        material: "PLA",
        subtype: "Basic",
        rgba: "FFFFFFFF",
        remainPercent: 81,
      }),
      readTray({
        id: 2,
        material: "PLA",
        subtype: "Basic",
        rgba: "A03472FF",
        remainPercent: 39,
      }),
      readTray({
        id: 3,
        material: "PLA",
        subtype: "Basic",
        rgba: "FF6A13FF",
        remainPercent: 58,
      }),
    ],
  },
]

/** Three online printers, three AMS units each. */
export const PRINTERS: Printer[] = [
  {
    id: "magi",
    name: "Magi",
    isOnline: true,
    ams: MAGI_AMS,
  },
  {
    id: "foopie",
    name: "Foopie",
    isOnline: true,
    ams: FOOPIE_AMS,
  },
  {
    id: "quadrahedron",
    name: "Quadrahedron",
    isOnline: true,
    ams: QUADRAHEDRON_AMS,
  },
]

/** Nothing on the reader, the scale at zero. */
export const buildSpools = (
  overrides: Partial<SpoolsData> = {},
): SpoolsData => ({
  scale: { grams: 0, isStable: true, isOnline: true },
  tag: { state: "none" },
  spools: INVENTORY,
  printers: PRINTERS,
  ...overrides,
})

/** The Ash Gray spool on the scale, its Bambu tag matched. */
export const buildMatchedSpools = (
  overrides: Partial<SpoolsData> = {},
): SpoolsData =>
  buildSpools({
    scale: { grams: 542, isStable: true, isOnline: true },
    tag: {
      state: "matched",
      uid: ASH_GRAY_SPOOL.tagUid,
      tagType: "Bambu",
      trayUuid: ASH_GRAY_SPOOL.trayUuid,
      spoolId: ASH_GRAY_SPOOL.id,
    },
    ...overrides,
  })

/** A sticker the inventory has never seen, on a heavy spool. */
export const buildUnknownSpools = (
  overrides: Partial<SpoolsData> = {},
): SpoolsData =>
  buildSpools({
    scale: { grams: 1_137, isStable: true, isOnline: true },
    tag: {
      state: "unknown",
      uid: "04B5C84D",
      tagType: "NTAG215",
    },
    ...overrides,
  })
