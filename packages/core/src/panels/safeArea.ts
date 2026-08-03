/**
 * A physical mat/frame overlaps the panel edges and hides whatever is under
 * it. `SafeAreaInset` pushes a text view inward by this many *native* pixels
 * per edge so nothing important lands under the mat; the freed margin renders
 * white. Photo views pass no inset and bleed to the panel edge instead.
 *
 * Kept here, free of sharp, so the browser preview resolves the same box from
 * the same code the server renders against — a preview that approximated this
 * would show crops the device never produces.
 */
export type SafeAreaInset = {
  top: number
  right: number
  bottom: number
  left: number
}

const NO_INSET: SafeAreaInset = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
}

/** Clamp the insets so the content box never collapses below 1×1 native px. */
const clampInset = ({
  inset,
  width,
  height,
}: {
  inset: SafeAreaInset
  width: number
  height: number
}): SafeAreaInset => {
  const left = Math.max(0, Math.min(inset.left, width - 1))
  const right = Math.max(
    0,
    Math.min(inset.right, width - 1 - left),
  )
  const top = Math.max(0, Math.min(inset.top, height - 1))
  const bottom = Math.max(
    0,
    Math.min(inset.bottom, height - 1 - top),
  )
  return { top, right, bottom, left }
}

/**
 * Resolve a device + requested inset into the safe (clamped) inset and the
 * content box the view must be laid out in. The view element MUST be built at
 * `contentWidth × contentHeight` (not the full panel) so its text reflows and
 * sizes to what stays visible under the mat — the caller uses this to build
 * the element, and `renderDeviceImage` uses the same result to render + place
 * it. Same inputs → same box, so the two never drift.
 */
export const resolveSafeArea = ({
  width,
  height,
  safeAreaInset,
}: {
  width: number
  height: number
  safeAreaInset?: SafeAreaInset
}) => {
  const inset = clampInset({
    inset: safeAreaInset ?? NO_INSET,
    width,
    height,
  })
  const hasInset =
    inset.top > 0 ||
    inset.right > 0 ||
    inset.bottom > 0 ||
    inset.left > 0

  return {
    inset,
    hasInset,
    contentWidth: width - inset.left - inset.right,
    contentHeight: height - inset.top - inset.bottom,
  }
}
