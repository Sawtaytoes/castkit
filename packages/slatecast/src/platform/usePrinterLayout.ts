import { selectPriorityLayout } from "@charcuterie/logic/core"
import { useLayoutEffect, useRef } from "preact/hooks"
import {
  applyPrinterDetailLevel,
  measurePrinterFacts,
  type PrinterDetailLevel,
} from "./printerContentFit.ts"

const SECTION_PRIORITIES = {
  camera: { media: 2, facts: 1 },
  static: { media: 1, facts: 2 },
} as const

/** Measure both axes and the real facts, then apply the shared priority policy. */
export const usePrinterLayout = ({
  isCamera,
  hasImage,
  contentKey,
  minimumDetailLevel = 0,
}: {
  isCamera: boolean
  hasImage: boolean
  contentKey: string
  minimumDetailLevel?: number
}) => {
  const card = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
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
      element.dataset.compact = String(height < 420)
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
      const measuredGap = Number.parseFloat(style.columnGap)
      const gap = Number.isFinite(measuredGap)
        ? measuredGap
        : 12
      const makeCandidate = (
        orientation: "vertical" | "horizontal" | "facts",
        factsWidth: number,
        detailLevel: PrinterDetailLevel,
      ) => {
        const factsHeight = measurePrinterFacts({
          card: element,
          width: factsWidth,
          detailLevel,
          isCompact: height < 420,
        })
        const mediaWidth =
          orientation === "horizontal"
            ? Math.max(0, width - factsWidth - gap)
            : width
        const mediaHeight =
          orientation === "vertical"
            ? Math.max(0, height - factsHeight - gap)
            : height
        const isMediaHidden = orientation === "facts"
        return {
          id: `${orientation}-${factsWidth}-${detailLevel}`,
          orientation,
          factsWidth,
          detailLevel,
          sections: [
            {
              priority: priorities.media,
              visibilityPriority: 3,
              isHidden: isMediaHidden,
              width: isMediaHidden ? 0 : mediaWidth,
              height: isMediaHidden ? 0 : mediaHeight,
              minimumWidth: 100,
              minimumHeight: Math.max(
                56,
                100 / aspectRatio,
              ),
              aspectRatio,
            },
            {
              priority: priorities.facts,
              width: factsWidth,
              height: 1,
              idealArea: Math.min(640, width),
              minimumWidth: Math.min(
                detailLevel < 2 ? 320 : 180,
                width,
              ),
            },
            {
              priority: 0,
              width: factsWidth,
              height,
              minimumHeight: factsHeight,
            },
            {
              priority: 0,
              visibilityPriority: 2,
              isHidden: detailLevel >= 2,
              width: 1,
              height: 1,
            },
            {
              priority: 0,
              visibilityPriority: 1,
              isHidden: detailLevel >= 1,
              width: 1,
              height: 1,
            },
          ],
        }
      }
      const candidates = ([0, 1, 2, 3] as const)
        .filter((level) => level >= minimumDetailLevel)
        .flatMap((detailLevel) =>
          detailLevel === 3 || !hasImage
            ? [makeCandidate("facts", width, detailLevel)]
            : [
                makeCandidate(
                  "vertical",
                  width,
                  detailLevel,
                ),
                ...[0.3, 0.4, 0.5, 0.6, 0.7].map(
                  (fraction) =>
                    makeCandidate(
                      "horizontal",
                      (width - gap) * fraction,
                      detailLevel,
                    ),
                ),
                ...(width > 652
                  ? [
                      makeCandidate(
                        "horizontal",
                        640,
                        detailLevel,
                      ),
                      makeCandidate(
                        "horizontal",
                        320,
                        detailLevel,
                      ),
                    ]
                  : []),
              ],
        )
      const chosen = selectPriorityLayout(candidates)
      if (chosen) {
        element.dataset.orientation = chosen.orientation
        applyPrinterDetailLevel(element, chosen.detailLevel)
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
  }, [isCamera, hasImage, contentKey, minimumDetailLevel])
  return card
}
