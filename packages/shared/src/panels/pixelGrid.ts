/**
 * The subpixel stripe, and whether subpixel antialiasing may be trusted.
 *
 * See `docs/display-properties.md`. Two measured facts set the scope:
 *
 * 1. A frame-fed panel never carries subpixel fringes. Headless Chromium
 *    renders text with GRAYSCALE antialiasing and will not do otherwise —
 *    measured 2026-09-13 on a 320x48 black-on-white render: 827 antialiased
 *    pixels, zero with any color in them, byte-identical with and without
 *    `--enable-lcd-text`. So this property only reaches a `live-browser`
 *    panel.
 * 2. On a `live-browser` panel it matters only when the glass has no stripe,
 *    or when the panel is mounted rotated and the stripe therefore runs the
 *    other way from the one Chromium assumes.
 */

export const PIXEL_GRIDS = [
  "none",
  "rgb-stripe",
  "bgr-stripe",
] as const

export type PixelGrid = (typeof PIXEL_GRIDS)[number]

/**
 * Whether text on this panel must be antialiased in gray rather than in
 * subpixels.
 *
 * Two ways to reach `true`:
 *
 * - The glass has no stripe. Every ePaper panel is here, and a subpixel fringe
 *   would be colored noise on a panel that cannot even paint the colors.
 * - The panel has a stripe but is hung sideways. Chromium takes the subpixel
 *   order from fontconfig's `rgba`, which names a HORIZONTAL order; a panel
 *   turned a quarter turn has a vertical stripe, and every fringe lands on the
 *   wrong axis.
 *
 * ⚠️ The rotated case has a better fix than this one — set fontconfig `rgba`
 * to `vrgb` or `vbgr` on that host, and the stripe is used correctly instead
 * of abandoned. This is the fix CastKit can apply on its own, from CSS, with
 * no access to the panel's operating system.
 *
 * ⚠️ Unverified on hardware. The fringing case has not been reproduced on a
 * Pi; the test is to mount a panel rotated, render small text, and photograph
 * it closely.
 */
export const getIsGrayscaleTextRequired = ({
  orientation,
  pixelGrid,
}: {
  orientation: 0 | 90 | 180 | 270
  pixelGrid: PixelGrid
}): boolean =>
  pixelGrid === "none" ||
  orientation === 90 ||
  orientation === 270
