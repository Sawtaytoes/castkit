import { getEffectiveRepaint } from "@castkit/shared/panels/repaint"
import type { ComponentChildren } from "preact"
import { useLayoutEffect, useRef } from "preact/hooks"
import type { DisplayProperties } from "./displayProperties.ts"

/** Animate a new composition once; live data updates keep their existing DOM. */
export const ViewTransition = ({
  revision,
  properties,
  isPending,
  children,
}: {
  revision: string
  properties?: DisplayProperties
  isPending: boolean
  children: ComponentChildren
}) => {
  const element = useRef<HTMLDivElement>(null)
  const previousRevision = useRef(revision)
  const repaint = getEffectiveRepaint({
    repaint: properties?.repaint ?? "instant",
    power: properties?.power ?? "wired",
  })
  useLayoutEffect(() => {
    const hasChanged = previousRevision.current !== revision
    previousRevision.current = revision
    if (
      !hasChanged ||
      repaint !== "instant" ||
      window.matchMedia("(prefers-reduced-motion: reduce)")
        .matches
    )
      return
    const animation = element.current?.animate(
      [
        { opacity: 0, transform: "translateY(8px)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 220, easing: "ease-out" },
    )
    return () => animation?.cancel()
  }, [revision, repaint])
  return (
    <div
      ref={element}
      class="platform-view"
      aria-busy={isPending}
      inert={isPending}
    >
      {children}
    </div>
  )
}
