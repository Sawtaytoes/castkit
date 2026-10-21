import { createContext } from "preact"
import { useLayoutEffect, useRef } from "preact/hooks"

/** A view reports navigation; the composition owns priority, fit and motion. */
export const CompositionNavigation = createContext<
  | {
      navigate: (
        update: () => void,
        isDetailOpen: boolean,
      ) => void
      release: () => void
    }
  | undefined
>(undefined)

/** FLIP the mounted panels after the priority layout has measured the new screen. */
export const useCompositionTransition = ({
  element,
  revision,
  isAnimated,
}: {
  element: { current: HTMLDivElement | null }
  revision: number
  isAnimated: boolean
}) => {
  const previous = useRef(new Map<HTMLElement, DOMRect>())
  const animations = useRef<Animation[]>([])
  const canAnimate = () =>
    isAnimated &&
    !window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches
  const capture = () => {
    previous.current.clear()
    if (canAnimate()) {
      element.current
        ?.querySelectorAll<HTMLElement>(
          "[data-composition-key]",
        )
        .forEach((panel) => {
          const bounds = panel.getBoundingClientRect()
          if (bounds.width && bounds.height)
            previous.current.set(panel, bounds)
        })
    }
    animations.current.forEach((animation) => {
      animation.cancel()
    })
    animations.current = []
  }
  useLayoutEffect(() => {
    // Run after the measured layout commits, before the browser paints it.
    if (!canAnimate() || previous.current.size === 0) return
    element.current
      ?.querySelectorAll<HTMLElement>(
        "[data-composition-key]",
      )
      .forEach((panel) => {
        const next = panel.getBoundingClientRect()
        if (!next.width || !next.height) return
        const before = previous.current.get(panel)
        animations.current.push(
          panel.animate(
            [
              before
                ? {
                    transform: `translate(${before.x - next.x}px, ${before.y - next.y}px) scale(${before.width / next.width}, ${before.height / next.height})`,
                    opacity: 0.85,
                  }
                : { opacity: 0 },
              { transform: "none", opacity: 1 },
            ],
            { duration: 240, easing: "ease-out" },
          ),
        )
      })
    previous.current.clear()
  }, [revision, isAnimated])
  useLayoutEffect(
    () => () => {
      animations.current.forEach((animation) => {
        animation.cancel()
      })
    },
    [],
  )
  return capture
}
