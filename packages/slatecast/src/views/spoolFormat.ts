import type { SpoolsData } from "@castkit/shared/viewData/types"

/**
 * Pure helpers for the Filament Spool Scale view: the words and numbers the
 * screens print, derived from the `spools.v1` channel and nothing else.
 */

/** One inventory spool. */
export type Spool = SpoolsData["spools"][number]
/** One printer with its AMS units. */
export type SpoolPrinter = SpoolsData["printers"][number]
/** One AMS unit with its trays. */
export type AmsUnit = SpoolPrinter["ams"][number]
/** One AMS tray: read, untagged or empty. */
export type AmsTray = AmsUnit["trays"][number]

/**
 * A tray at or below this much reads as low, in the warning color. Bambu's own
 * dashboard turns a slot amber at the same figure.
 */
const LOW_PERCENT = 10

/**
 * Whole grams with a narrow no-break space every three digits — `1 137`, the
 * way the panel's mockup wrote it. A comma reads as a decimal point to half of
 * the people who will stand at this scale.
 */
export const formatGrams = (grams: number) =>
  String(Math.round(grams)).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    " ",
  )

/**
 * What is left on the spool by the scale: the reading minus the empty spool's
 * own weight, never below zero. Zero is what a bare core reads, and a negative
 * number would say the core weighs more than the spool.
 */
export const getNetGrams = ({
  scaleGrams,
  coreWeightGrams,
}: {
  scaleGrams: number
  coreWeightGrams: number
}) => Math.max(0, Math.round(scaleGrams - coreWeightGrams))

/** Whole percent of the label weight, clamped to 0–100. */
export const getPercentOfLabel = ({
  grams,
  labelWeightGrams,
}: {
  grams: number
  labelWeightGrams: number
}) =>
  labelWeightGrams > 0
    ? Math.min(
        100,
        Math.max(
          0,
          Math.round((grams / labelWeightGrams) * 100),
        ),
      )
    : 0

/** `PLA Matte`: the material and its subtype, which is how a shop names it. */
export const getSpoolProductName = ({
  material,
  subtype,
}: {
  material: string
  subtype?: string
}) => [material, subtype].filter(Boolean).join(" ")

/**
 * The short name the crumbs and the hints use: the color name, or the product
 * when the record has no color name. `Ash Gray`, not `PLA Matte Ash Gray`.
 */
export const getSpoolShortName = (spool: Spool) =>
  spool.colorName ?? getSpoolProductName(spool)

/**
 * `Bambu Lab · 1 kg`. The label weight is what the spool held new; a person
 * reads it as the product size, so it is the product line and not a fact row.
 */
export const getSpoolBrandLine = (spool: Spool) =>
  [
    spool.brand,
    spool.labelWeightGrams >= 1_000 &&
    spool.labelWeightGrams % 250 === 0
      ? `${spool.labelWeightGrams / 1_000} kg`
      : `${formatGrams(spool.labelWeightGrams)} g`,
  ]
    .filter(Boolean)
    .join(" · ")

/**
 * The reader's tag family, for the chip. A Bambu tag is what the AMS reads on
 * its own; anything else is a sticker somebody put on.
 */
export const describeTagType = (
  tagType: string | undefined,
) =>
  tagType === undefined
    ? "Tag"
    : /bambu/i.test(tagType)
      ? "Bambu tag"
      : tagType

/**
 * The AMS unit's label for a spool's location, read off the printer that
 * holds it. The channel's `location` carries the unit's id, which is a number
 * a person never sees; the unit's own `label` is what is printed on the box.
 */
export const describeLocation = ({
  location,
  printers,
}: {
  location: NonNullable<Spool["location"]>
  printers: readonly SpoolPrinter[]
}) => {
  const unit = printers
    .find((printer) => printer.id === location.printerId)
    ?.ams.find(
      (candidate) => candidate.id === location.amsId,
    )
  const unitLabel =
    unit?.label ?? `AMS ${location.amsId + 1}`
  return `${location.printerName} · ${unitLabel} · slot ${location.trayId + 1}`
}

/** `Spool, no tag` and `Empty` are states; a read tray is named by its product. */
export const describeTray = (tray: AmsTray) =>
  tray.state === "read"
    ? getSpoolProductName({
        material: tray.material ?? "Spool",
        subtype: tray.subtype,
      })
    : tray.state === "untagged"
      ? "Spool, no tag"
      : "Empty"

/** Whether a read tray is nearly out. */
export const getIsTrayLow = (tray: AmsTray) =>
  tray.state === "read" &&
  tray.remainPercent !== undefined &&
  tray.remainPercent <= LOW_PERCENT

/** How many trays of each state a set of AMS units holds. */
export const countTrays = (units: readonly AmsUnit[]) => {
  const trays = units.flatMap((unit) => unit.trays)
  const countState = (state: AmsTray["state"]) =>
    trays.filter((tray) => tray.state === state).length
  return {
    read: countState("read"),
    untagged: countState("untagged"),
    empty: countState("empty"),
    low: trays.filter(getIsTrayLow).length,
  }
}

const pluralize = ({
  count,
  singular,
  plural,
}: {
  count: number
  singular: string
  plural: string
}) => `${count} ${count === 1 ? singular : plural}`

/** `2 spools with no tag · 2 empty`, or `all slots read` when there is nothing to say. */
export const describeTrayCounts = (
  units: readonly AmsUnit[],
) => {
  const counts = countTrays(units)
  const parts = [
    counts.untagged > 0
      ? pluralize({
          count: counts.untagged,
          singular: "spool with no tag",
          plural: "spools with no tag",
        })
      : null,
    counts.empty > 0
      ? pluralize({
          count: counts.empty,
          singular: "empty slot",
          plural: "empty slots",
        })
      : null,
  ].filter((part) => part !== null)
  return parts.length > 0
    ? parts.join(" · ")
    : counts.read > 0
      ? "all slots read"
      : "no slots"
}

/** The AMS-view chips: how many slots are low and how many hold an unread spool. */
export const describeAmsWarnings = (
  units: readonly AmsUnit[],
) => {
  const counts = countTrays(units)
  return {
    lowText:
      counts.low > 0
        ? pluralize({
            count: counts.low,
            singular: "slot low",
            plural: "slots low",
          })
        : null,
    untaggedText:
      counts.untagged > 0
        ? pluralize({
            count: counts.untagged,
            singular: "spool with no tag",
            plural: "spools with no tag",
          })
        : null,
  }
}

/**
 * The line under a printer's name on the assign step: how many units it has
 * and what room they have.
 */
export const describePrinterForAssign = (
  printer: SpoolPrinter,
) =>
  `${pluralize({ count: printer.ams.length, singular: "AMS", plural: "AMS" })} · ${describeTrayCounts(printer.ams)}`

/**
 * The verdict at the foot of a printer card on the assign step. A spool that
 * is already loaded somewhere on that printer says where, because assigning
 * it again would move it.
 */
export const describePrinterVerdict = ({
  printer,
  spool,
}: {
  printer: SpoolPrinter
  spool: Spool
}) => {
  if (!printer.isOnline) {
    return { text: "Offline", isGood: false }
  }
  if (spool.location?.printerId === printer.id) {
    const unit = printer.ams.find(
      (candidate) => candidate.id === spool.location?.amsId,
    )
    return {
      text: `${getSpoolShortName(spool)} is already in ${unit?.label ?? `AMS ${spool.location.amsId + 1}`} · slot ${spool.location.trayId + 1}`,
      isGood: false,
    }
  }
  const counts = countTrays(printer.ams)
  return counts.untagged + counts.empty > 0
    ? { text: "Has room", isGood: true }
    : { text: "Every slot is read", isGood: false }
}

/** `13% RH · 2 empty slots`, the line under an AMS unit's name. */
export const describeAmsUnit = (unit: AmsUnit) => {
  const counts = countTrays(
    unit.trays.length > 0 ? [unit] : [],
  )
  const roomText =
    counts.untagged + counts.empty > 0
      ? describeTrayCounts([unit])
      : "full"
  return [
    unit.humidityPercent === undefined
      ? null
      : `${Math.round(unit.humidityPercent)}% RH`,
    roomText,
  ]
    .filter((part) => part !== null)
    .join(" · ")
}

/**
 * The verdict at the foot of a slot card: whether this is the slot the spool
 * most likely sits in. An unread spool of the same material is the likely
 * one — the AMS can see a spool there and cannot say which, and the person
 * holding this one just took it off that printer.
 */
export const describeSlotVerdict = ({
  tray,
  spool,
}: {
  tray: AmsTray
  spool: Spool
}) => {
  if (tray.state === "empty") {
    return { text: "Free", isGood: false }
  }
  const isSameMaterial =
    tray.material === undefined ||
    tray.material.toLowerCase() ===
      spool.material.toLowerCase()
  if (!isSameMaterial) {
    return { text: "Different material", isGood: false }
  }
  return tray.state === "untagged"
    ? { text: "Likely this one", isGood: true }
    : tray.spoolId === spool.id
      ? { text: "This spool is here now", isGood: true }
      : { text: "Replaces the spool here", isGood: false }
}

/** `PLA Matte · 15%` or `Spool, no tag · PLA`, the line under a slot card's swatch. */
export const describeSlotContents = (tray: AmsTray) =>
  tray.state === "read"
    ? [
        describeTray(tray),
        tray.remainPercent === undefined
          ? null
          : `${Math.round(tray.remainPercent)}%`,
      ]
        .filter((part) => part !== null)
        .join(" · ")
    : tray.state === "untagged"
      ? [describeTray(tray), tray.material]
          .filter((part) => part !== undefined)
          .join(" · ")
      : "Nothing loaded"
