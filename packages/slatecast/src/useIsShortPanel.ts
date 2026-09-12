import { useEffect, useState } from "preact/hooks"

/**
 * The short landscape panel: wider than tall by a clear margin, and short.
 * Today that is only the 480×320 WT32 workbench panel; the 720×720 square and
 * the 480×480 porthole cannot match it.
 *
 * The same query lives in `styles.css`. CSS carries the sizes; this hook
 * carries the *markup* a view needs on that panel (a date tile, a split
 * meridiem, a weather mark beside the clock), which a stylesheet cannot add.
 * Keep the two in step.
 */
export const SHORT_PANEL_QUERY =
  "(min-aspect-ratio: 5 / 4) and (max-height: 400px)"

export const useIsShortPanel = () => {
  const [isShortPanel, setIsShortPanel] = useState(
    () => matchMedia(SHORT_PANEL_QUERY).matches,
  )

  useEffect(() => {
    const mediaQueryList = matchMedia(SHORT_PANEL_QUERY)
    const update = () => {
      setIsShortPanel(mediaQueryList.matches)
    }
    update()
    mediaQueryList.addEventListener("change", update)
    return () => {
      mediaQueryList.removeEventListener("change", update)
    }
  }, [])

  return isShortPanel
}
