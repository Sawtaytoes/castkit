/** Saved zoom factors for one window, keyed by the CastKit view it showed. */
export type ZoomByView = Record<string, number>

/** The steps Ctrl + and Ctrl - move through, matching Chrome's own ladder. */
export const zoomSteps = [
  0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5,
  1.75, 2, 2.5, 3, 4, 5,
] as const

const minimumZoom = zoomSteps[0]
const maximumZoom = zoomSteps[zoomSteps.length - 1]

/** Snap a stored factor back into the supported range. */
export const clampZoomFactor = (factor: number) =>
  Number.isFinite(factor)
    ? Math.min(Math.max(factor, minimumZoom), maximumZoom)
    : 1

const tolerance = 0.001

/**
 * The next zoom step in a direction. A factor between two steps (a ladder
 * from an older version, or Ctrl + wheel) moves to the nearest step on the
 * requested side rather than skipping one.
 */
export const stepZoomFactor = ({
  factor,
  direction,
}: {
  factor: number
  direction: "in" | "out"
}) => {
  if (direction === "in") {
    return (
      zoomSteps.find((step) => step > factor + tolerance) ??
      maximumZoom
    )
  }
  return (
    zoomSteps.findLast(
      (step) => step < factor - tolerance,
    ) ?? minimumZoom
  )
}

/** The factor to apply for a view; a view never zoomed shows at 100%. */
export const readZoomFactor = ({
  zoomByView,
  viewKey,
}: {
  zoomByView: ZoomByView
  viewKey: string
}) => clampZoomFactor(zoomByView[viewKey] ?? 1)

/**
 * Record a view's factor. 100% is the default, so it is stored as the absence
 * of an entry; the saved file then lists only the views someone zoomed.
 */
export const writeZoomFactor = ({
  zoomByView,
  viewKey,
  factor,
}: {
  zoomByView: ZoomByView
  viewKey: string
  factor: number
}): ZoomByView => {
  const clamped = clampZoomFactor(factor)
  const others = Object.fromEntries(
    Object.entries(zoomByView).filter(
      ([key]) => key !== viewKey,
    ),
  )
  return Math.abs(clamped - 1) < tolerance
    ? others
    : { ...others, [viewKey]: clamped }
}

/**
 * The key a window's zoom is saved under. The page reports its active view
 * (`data-view`); until it does, or on a page that never does, the path stands
 * in, so each URL still keeps its own zoom.
 */
export const resolveViewKey = ({
  reportedView,
  url,
}: {
  reportedView: string | null
  url: string
}) => {
  if (reportedView) {
    return `view:${reportedView}`
  }
  try {
    return `path:${new URL(url).pathname}`
  } catch {
    return "path:/"
  }
}
