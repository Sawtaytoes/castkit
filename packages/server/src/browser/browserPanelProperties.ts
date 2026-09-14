import type { Delivery } from "@castkit/shared/panels/delivery"
import type { PixelGrid } from "@castkit/shared/panels/pixelGrid"
import type { RepaintGrade } from "@castkit/shared/panels/repaint"
import type { BrowserDeviceConfig } from "../config/env.ts"

/**
 * Fill in the Axis A panel facts a browser device's config left out.
 *
 * Three properties reach the glass through `BrowserDeviceProfile`, and none of
 * them was on the wire before 2026-09-14. A devices file therefore carries
 * none of them, so every value here has to be derivable from what a
 * live-browser entry already says, or the stamp ships empty. An explicit value
 * always wins.
 */

/**
 * A live-browser panel repaints as fast as its compositor, which is the
 * definition of `instant`. The grade is still overridable, because a browser
 * running on something slow — a WPE build on an old Pi, a remote framebuffer —
 * is not `instant` and should not be told it may animate.
 */
const DEFAULT_BROWSER_REPAINT: RepaintGrade = "instant"

/**
 * Whether the panel's own controller dithers.
 *
 * `false` for every live-browser panel in existence: the glass takes the
 * frame the browser composited, and no controller sits in between to reduce
 * it. It is on the wire anyway, because the property is a fact about the
 * panel and not about this one transport, and a view that asks "must I dither
 * this myself?" must get an answer on every display kind.
 */
const hasBrowserPanelDitheringByDefault = false

/**
 * A full-color panel is an LCD, and an LCD has a stripe. Anything else is a
 * reduced-ink panel, and a reduced-ink panel has no stripe worth trusting —
 * a subpixel fringe there is colored noise.
 *
 * `rgb-stripe` rather than `bgr-stripe` because RGB is what fontconfig
 * defaults to and what Chromium therefore assumes. Declaring it enables
 * nothing on its own; it only stops CastKit forcing grayscale text on a panel
 * that has a usable stripe.
 */
const getDefaultPixelGrid = (
  color: BrowserDeviceConfig["color"],
): PixelGrid => (color === "full" ? "rgb-stripe" : "none")

export const resolveBrowserPanelProperties = (
  device: Pick<
    BrowserDeviceConfig,
    "color" | "hasPanelDithering" | "pixelGrid" | "repaint"
  >,
): {
  repaint: RepaintGrade
  hasPanelDithering: boolean
  pixelGrid: PixelGrid
  delivery: Delivery
} => ({
  /*
   * Not derived and not configurable. A device that opens the Slatecast
   * WebSocket IS a browser drawing its own pixels; anything else in this field
   * would be a lie the stylesheet then acts on.
   */
  delivery: "live-browser",
  repaint: device.repaint ?? DEFAULT_BROWSER_REPAINT,
  hasPanelDithering:
    device.hasPanelDithering ??
    hasBrowserPanelDitheringByDefault,
  pixelGrid:
    device.pixelGrid ?? getDefaultPixelGrid(device.color),
})
