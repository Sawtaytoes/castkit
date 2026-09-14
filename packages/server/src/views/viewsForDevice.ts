import {
  getEffectiveRepaint,
  getIsValueFreshEnough,
  type RepaintGrade,
} from "@castkit/core/panels/repaint"
import { VIEW_VALUE_LIFETIME_MILLISECONDS } from "@castkit/shared/views/viewFreshness"
import {
  VIEW_NAMES,
  type ViewName,
} from "@castkit/shared/views/viewNames"

/**
 * Which views a display is offered.
 *
 * Before this existed, every device was offered every view. That is why the
 * 28-second Inky Impression appeared in Home Assistant with `Clock`,
 * `Clock (Weather)` and `Clock (Agenda)` in its select — three views it cannot
 * draw before the value on them is wrong.
 */

type RepaintFacts = {
  /** Explicit grade from the devices file, when the owner set one. */
  repaint?: RepaintGrade
  /** Present on image devices. `http-pull` is the ESPHome M5Paper path. */
  imageDelivery?: "mqtt-image" | "http-pull"
  colorMode?: string
  /** Browser devices render live in a kiosk browser. */
  isBrowserDevice?: boolean
  power?: "wired" | "battery"
}

/**
 * Work out a panel's repaint grade when the devices file does not say.
 *
 * ⚠️ This is a DEFAULT, not a measurement. An explicit `repaint` always wins,
 * and a new panel kind should set one rather than lean on the inference here.
 *
 * The inference exists so that turning this filter on does not require every
 * existing deployment to hand-edit its devices file first — which would have
 * meant shipping a fix that stayed off until somebody noticed.
 *
 * It reads the two facts already on disk:
 *
 * - A browser device renders in a kiosk browser, so it is `instant`.
 * - `http-pull` today means the ESPHome M5Paper, which partial-updates in well
 *   under a second: `fast`.
 * - A multi-ink ePaper panel does a full flash measured in tens of seconds:
 *   `super-slow`.
 * - Anything else is a one-ink ePaper panel doing a 2-5 second full refresh:
 *   `slow`.
 */
export const getDefaultRepaint = (
  facts: RepaintFacts,
): RepaintGrade => {
  if (facts.isBrowserDevice) {
    return "instant"
  }

  if (facts.imageDelivery === "http-pull") {
    return "fast"
  }

  if (
    facts.colorMode === "spectra6" ||
    facts.colorMode === "galleryPalette7"
  ) {
    return "super-slow"
  }

  return "slow"
}

export const getRepaintForDevice = (
  facts: RepaintFacts,
): RepaintGrade => facts.repaint ?? getDefaultRepaint(facts)

/**
 * The view names this device may be offered, in the canonical order.
 *
 * ⚠️ Never returns an empty list. A display with no views is unreachable from
 * Home Assistant and cannot be recovered without editing a config file, so a
 * panel too slow for anything still keeps the longest-lived view it has.
 */
export const getViewsForDevice = (
  facts: RepaintFacts,
): readonly ViewName[] => {
  const repaint = getEffectiveRepaint({
    power: facts.power ?? "wired",
    repaint: getRepaintForDevice(facts),
  })

  const allowed = VIEW_NAMES.filter((viewName) =>
    getIsValueFreshEnough({
      repaint,
      valueLifetimeMilliseconds:
        VIEW_VALUE_LIFETIME_MILLISECONDS[viewName],
    }),
  )

  if (allowed.length > 0) {
    return allowed
  }

  const longestLived = [...VIEW_NAMES].sort(
    (left, right) =>
      VIEW_VALUE_LIFETIME_MILLISECONDS[right] -
      VIEW_VALUE_LIFETIME_MILLISECONDS[left],
  )[0]

  return longestLived ? [longestLived] : VIEW_NAMES
}
