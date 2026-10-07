import { type RefObject, useEffect, useState } from "react"

/** Release live previews when they leave the viewport or the management tab is hidden. */
export const usePreviewVisibility = (
  element: RefObject<HTMLElement | null>,
) => {
  const [isIntersecting, setIsIntersecting] =
    useState(false)
  const [isTabVisible, setIsTabVisible] = useState(
    document.visibilityState === "visible",
  )
  useEffect(() => {
    const target = element.current
    if (!target) return
    const observer = new IntersectionObserver(([entry]) =>
      setIsIntersecting(entry?.isIntersecting ?? false),
    )
    observer.observe(target)
    const update = () =>
      setIsTabVisible(
        document.visibilityState === "visible",
      )
    document.addEventListener("visibilitychange", update)
    return () => {
      observer.disconnect()
      document.removeEventListener(
        "visibilitychange",
        update,
      )
    }
  }, [element])
  return isIntersecting && isTabVisible
}
