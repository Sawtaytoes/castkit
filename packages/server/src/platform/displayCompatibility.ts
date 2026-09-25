import type { ViewDefinition } from "@castkit/sdk/contracts"
import {
  FRESHNESS_RATIO,
  getEffectiveRepaint,
  getIsValueFreshEnough,
  REPAINT_GRADES,
  REPAINT_MILLISECONDS,
  type RepaintGrade,
} from "@castkit/shared/panels/repaint"
import type { PlatformCatalog } from "./platformCatalog.ts"

/** Physical properties used to select compatible compositions and time formats. */
export type PlatformDisplayProperties = {
  delivery: "browser" | "image"
  repaint: RepaintGrade
  power?: "wired" | "battery"
  hasTouch?: boolean
}
/** One consistent freshness policy for browser rendering and finished frames. */
export const getPlatformDisplayCapabilities = (
  display: PlatformDisplayProperties,
) => {
  const repaint = getEffectiveRepaint({
    repaint: display.repaint,
    power: display.power ?? "wired",
  })
  return {
    delivery: display.delivery,
    repaint,
    hasTouch: display.hasTouch ?? false,
    minimumValueLifetimeMilliseconds:
      REPAINT_MILLISECONDS[repaint] * FRESHNESS_RATIO,
    hasClockSeconds: getIsValueFreshEnough({
      repaint,
      valueLifetimeMilliseconds: 1000,
    }),
    hasClockMinutes: getIsValueFreshEnough({
      repaint,
      valueLifetimeMilliseconds: 60000,
    }),
    hasLiveCamera:
      display.delivery === "browser" &&
      REPAINT_GRADES.indexOf(repaint) <=
        REPAINT_GRADES.indexOf("fast"),
    hasRelativeTimes: getIsValueFreshEnough({
      repaint,
      valueLifetimeMilliseconds: 60000,
    }),
  }
}
/** Explain every unsupported panel before assigning a composition to a display. */
export const getDisplayCompatibility = ({
  view,
  catalog,
  display,
}: {
  view: ViewDefinition
  catalog: PlatformCatalog
  display: PlatformDisplayProperties
}) => {
  const capabilities =
    getPlatformDisplayCapabilities(display)
  const reasons = view.panels.flatMap((panel) => {
    const spec = catalog.getViewSpec(panel.specId)
    if (!spec) {
      return [
        `Unknown view specification: ${panel.specId}.`,
      ]
    }
    if (!spec.renderers.includes(display.delivery)) {
      return [
        `${spec.name} does not support ${display.delivery} delivery.`,
      ]
    }
    if (
      spec.minimumRepaint &&
      REPAINT_GRADES.indexOf(capabilities.repaint) >
        REPAINT_GRADES.indexOf(spec.minimumRepaint)
    ) {
      return [
        `${spec.name} requires ${spec.minimumRepaint} repaint or faster.`,
      ]
    }
    if (
      spec.valueLifetimeMilliseconds !== undefined &&
      !getIsValueFreshEnough({
        repaint: capabilities.repaint,
        valueLifetimeMilliseconds:
          spec.valueLifetimeMilliseconds,
      })
    ) {
      return [
        `${spec.name} changes too quickly for this display.`,
      ]
    }
    return []
  })
  return {
    isCompatible: reasons.length === 0,
    reasons,
    capabilities,
  }
}
