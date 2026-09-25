import {
  getEffectiveRepaint,
  getIsValueFreshEnough,
  type RepaintGrade,
} from "@castkit/shared/panels/repaint"
import { createContext } from "preact"
import { useContext } from "preact/hooks"

/** Panel facts arrive from CastKit, never from browser media queries. */
export type DisplayProperties = {
  delivery?: "browser" | "image"
  repaint: RepaintGrade
  power?: "wired" | "battery"
  width?: number
  height?: number
  hasTouch?: boolean
  colorMode?: string
}
/** Browser links have instant repaint and interactive controls unless assigned a physical display. */
export const DisplayPropertiesContext = createContext<
  DisplayProperties | undefined
>(undefined)
/** Reuse CastKit's shared ten-times-repaint rule for individual rendered facts. */
export const useDisplayProperties = () => {
  const properties = useContext(DisplayPropertiesContext)
  const repaint = getEffectiveRepaint({
    repaint: properties?.repaint ?? "instant",
    power: properties?.power ?? "wired",
  })
  const isValueFresh = (
    valueLifetimeMilliseconds: number,
  ) =>
    getIsValueFreshEnough({
      repaint,
      valueLifetimeMilliseconds,
    })
  return {
    properties,
    repaint,
    isValueFresh,
    hasClockMinutes: isValueFresh(60000),
    hasClockSeconds: isValueFresh(1000),
    hasRelativeTimes: isValueFresh(60000),
    hasProgress: isValueFresh(10000),
    hasLiveCamera:
      properties?.delivery !== "image" &&
      isValueFresh(10000),
    isInteractive: properties?.hasTouch !== false,
  }
}
