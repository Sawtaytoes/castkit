import { selectPriorityLayout } from "@charcuterie/logic/core"
import { useEffect, useRef } from "preact/hooks"

const SECTION_PRIORITIES = {
  camera: { media: 2, facts: 1 },
  static: { media: 1, facts: 2 },
} as const

/** Measure both axes and the real facts, then apply the shared priority policy. */
export const usePrinterLayout = ({
  isCamera,
  hasImage,
  contentKey,
}: {
  isCamera: boolean
  hasImage: boolean
  contentKey: string
}) => {
  const card = useRef<HTMLElement>(null)
  useEffect(() => {
    const element = card.current
    const body =
      element?.querySelector<HTMLElement>(".printer-body")
    if (!element || !body) {
      return
    }
    const priorities = isCamera
      ? SECTION_PRIORITIES.camera
      : SECTION_PRIORITIES.static
    const measure = () => {
      const style = getComputedStyle(element)
      const width =
        element.clientWidth -
        Number.parseFloat(style.paddingLeft) -
        Number.parseFloat(style.paddingRight)
      const height =
        element.clientHeight -
        Number.parseFloat(style.paddingTop) -
        Number.parseFloat(style.paddingBottom)
      if (width <= 0 || height <= 0) {
        return
      }
      if (!hasImage) {
        element.dataset.orientation = "facts"
        return
      }
      const media = element.querySelector<
        HTMLImageElement | HTMLVideoElement
      >(".expandable-media img, .expandable-media video")
      const mediaWidth =
        media instanceof HTMLVideoElement
          ? media.videoWidth
          : media?.naturalWidth
      const mediaHeight =
        media instanceof HTMLVideoElement
          ? media.videoHeight
          : media?.naturalHeight
      const aspectRatio =
        mediaWidth && mediaHeight
          ? mediaWidth / mediaHeight
          : isCamera
            ? 16 / 9
            : 1
      // Measure a noninteractive clone at each candidate width, with the real
      // font and card styles. It never participates in grid sizing or a11y.
      const probe = body.cloneNode(true) as HTMLElement
      probe.inert = true
      probe.setAttribute("aria-hidden", "true")
      Object.assign(probe.style, {
        position: "absolute",
        visibility: "hidden",
        pointerEvents: "none",
        blockSize: "auto",
        maxBlockSize: "none",
        inset: "0 auto auto 0",
      })
      element.append(probe)
      const measuredGap = Number.parseFloat(style.columnGap)
      const gap = Number.isFinite(measuredGap)
        ? measuredGap
        : 12
      const makeCandidate = (
        orientation: "vertical" | "horizontal",
        factsWidth: number,
      ) => {
        probe.style.inlineSize = `${factsWidth}px`
        const factsHeight =
          probe.getBoundingClientRect().height
        const mediaWidth =
          orientation === "vertical"
            ? width
            : Math.max(0, width - factsWidth - gap)
        const mediaHeight =
          orientation === "vertical"
            ? Math.max(0, height - factsHeight - gap)
            : height
        return {
          id: `${orientation}-${factsWidth}`,
          orientation,
          factsWidth,
          sections: [
            {
              priority: priorities.media,
              width: mediaWidth,
              height: mediaHeight,
              aspectRatio,
            },
            // Width represents the useful reading measure; height is scored
            // separately through the required fit, rather than rewarding wraps.
            {
              priority: priorities.facts,
              width: factsWidth,
              height: 1,
              idealArea: Math.min(640, width),
              minimumWidth: Math.min(320, width),
            },
            {
              priority: 0,
              width: factsWidth,
              height:
                orientation === "vertical"
                  ? Math.min(height, factsHeight)
                  : height,
              minimumHeight: factsHeight,
            },
          ],
        }
      }
      const candidates = [
        makeCandidate("vertical", width),
        ...[
          0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7,
        ].map((fraction) =>
          makeCandidate(
            "horizontal",
            (width - gap) * fraction,
          ),
        ),
        ...(width > 652
          ? [
              makeCandidate("horizontal", 640),
              makeCandidate("horizontal", 320),
            ]
          : []),
      ]
      probe.remove()
      const chosen = selectPriorityLayout(candidates)
      if (chosen) {
        element.dataset.orientation = chosen.orientation
        element.style.setProperty(
          "--printer-facts-width",
          `${chosen.factsWidth}px`,
        )
      }
    }
    const pending = { frame: 0, isDisposed: false }
    const scheduleMeasure = () => {
      if (pending.isDisposed) {
        return
      }
      cancelAnimationFrame(pending.frame)
      pending.frame = requestAnimationFrame(measure)
    }
    const observer = new ResizeObserver(scheduleMeasure)
    observer.observe(element)
    observer.observe(body)
    element.addEventListener("load", scheduleMeasure, true)
    element.addEventListener(
      "loadedmetadata",
      scheduleMeasure,
      true,
    )
    void document.fonts.ready.then(scheduleMeasure)
    measure()
    return () => {
      pending.isDisposed = true
      cancelAnimationFrame(pending.frame)
      observer.disconnect()
      element.removeEventListener(
        "load",
        scheduleMeasure,
        true,
      )
      element.removeEventListener(
        "loadedmetadata",
        scheduleMeasure,
        true,
      )
    }
  }, [isCamera, hasImage, contentKey])
  return card
}
