import { getEffectiveRepaint } from "@castkit/shared/panels/repaint"
import type { ComponentChildren } from "preact"
import { useLayoutEffect, useRef } from "preact/hooks"
import {
  finishNavigation,
  navigationFeedback,
} from "../navigationFeedback.ts"
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
  const previousRevision = useRef<string | undefined>(
    navigationFeedback.peek()?.phase === "loading"
      ? undefined
      : revision,
  )
  const repaint = getEffectiveRepaint({
    repaint: properties?.repaint ?? "instant",
    power: properties?.power ?? "wired",
  })
  useLayoutEffect(() => {
    if (isPending) return
    const hasChanged = previousRevision.current !== revision
    previousRevision.current = revision
    finishNavigation()
    if (
      !hasChanged ||
      repaint !== "instant" ||
      window.matchMedia("(prefers-reduced-motion: reduce)")
        .matches
    )
      return
    const animation = element.current?.animate(
      [
        { opacity: 0.35, transform: "translateY(24px)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 280, easing: "ease-out" },
    )
    return () => animation?.cancel()
  }, [revision, repaint, isPending])
  return (
    <>
      <div
        ref={element}
        class="platform-view"
        aria-busy={isPending}
        inert={isPending}
      >
        {children}
      </div>
      {isPending && !navigationFeedback.value ? (
        <div class="view-loading-feedback" role="status">
          <span aria-hidden="true" />
          Loading view…
        </div>
      ) : null}
    </>
  )
}
