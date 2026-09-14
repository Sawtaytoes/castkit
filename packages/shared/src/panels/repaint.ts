/**
 * How long the glass takes to show a new frame, and what that permits.
 *
 * This is the property that decides which views a display is offered and which
 * values those views may print. See `docs/display-properties.md`.
 *
 * It lives in `shared` rather than `core` because the grade is now a WIRE
 * value: `BrowserDeviceProfile` carries it, so the Slatecast bundle needs the
 * type. `core` pulls in `sharp`, which cannot go near a browser bundle, and
 * `slatecast` depends on `shared` alone.
 */

export const REPAINT_GRADES = [
  "instant",
  "fast",
  "slow",
  "super-slow",
] as const

export type RepaintGrade = (typeof REPAINT_GRADES)[number]

/**
 * Representative time to put a new frame on the glass, in milliseconds.
 *
 * These are the middle of each grade rather than a measured figure for one
 * panel, because the grade is the unit of decision — two panels in the same
 * grade must behave the same, or the grade is not carrying its weight.
 */
export const REPAINT_MILLISECONDS: Record<
  RepaintGrade,
  number
> = {
  instant: 100,
  fast: 1_000,
  slow: 3_000,
  "super-slow": 28_000,
}

/**
 * The freshness rule.
 *
 * > A view may show a value only if the value will still be true when the panel
 * > finishes drawing it.
 *
 * Ten is a default and not a law. A view may state a stricter requirement of
 * its own; nothing may state a looser one.
 */
export const FRESHNESS_RATIO = 10

/**
 * Can a panel of this grade print a value that lives this long?
 *
 * `valueLifetimeMilliseconds` is how long the value stays TRUE, not how often
 * it is recomputed. A clock minute lives 60 s even though the clock ticks every
 * second.
 */
export const getIsValueFreshEnough = ({
  repaint,
  valueLifetimeMilliseconds,
}: {
  repaint: RepaintGrade
  valueLifetimeMilliseconds: number
}): boolean =>
  valueLifetimeMilliseconds >=
  REPAINT_MILLISECONDS[repaint] * FRESHNESS_RATIO

/**
 * A display installed on battery is treated as one grade slower, because every
 * repaint costs charge and the budget becomes repaints per day.
 *
 * ⚠️ This does NOT automatically remove a view. `fast` and `slow` offer the
 * same list today, so an unplugged M5Paper keeps its clock. The clock comes off
 * at `super-slow`. Dropping a grade only matters where the two grades differ —
 * an earlier version of the reference doc claimed otherwise and contradicted
 * its own freshness table.
 */
export const getEffectiveRepaint = ({
  power,
  repaint,
}: {
  power: "wired" | "battery"
  repaint: RepaintGrade
}): RepaintGrade => {
  if (power === "wired") {
    return repaint
  }

  const index = REPAINT_GRADES.indexOf(repaint)

  return (
    REPAINT_GRADES[
      Math.min(index + 1, REPAINT_GRADES.length - 1)
    ] ?? repaint
  )
}
