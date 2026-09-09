/**
 * A physical mat/frame overlaps the panel edges and hides whatever is under
 * it. `PanelMargin` is how far it overlaps, per edge, in *native* panel
 * pixels. Every view — photos included — is laid out inside what is left, and
 * the covered margin renders white. Nothing is cut off: the picture is made
 * smaller so all of it stays visible.
 *
 * This is NOT a crop. A margin pushes content inward; a crop cuts content away
 * to zoom what is left (`PhotoCrop`, applied to photo views only). Both exist
 * and they compose: the margin decides the box, the crop decides how much of
 * the photo fills it.
 *
 * Kept here, free of sharp, so the browser preview resolves the same box from
 * the same code the server renders against — a preview that approximated this
 * would show framing the device never produces.
 */
export type PanelMargin = {
  top: number
  right: number
  bottom: number
  left: number
}

const NO_INSET: PanelMargin = {
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
  inset: PanelMargin
  width: number
  height: number
}): PanelMargin => {
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
  margin,
}: {
  width: number
  height: number
  margin?: PanelMargin
}) => {
  const inset = clampInset({
    inset: margin ?? NO_INSET,
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
