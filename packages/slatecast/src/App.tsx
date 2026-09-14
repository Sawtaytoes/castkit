import { getIsGrayscaleTextRequired } from "@castkit/shared/panels/pixelGrid"
import type { ComponentType } from "preact"
import { useEffect } from "preact/hooks"
import { activeView, device, settings } from "./state.ts"
import {
  beginViewSwipe,
  cancelViewSwipe,
  endViewSwipe,
  trackViewSwipe,
} from "./viewSwipe.ts"
import { Ambient } from "./views/Ambient.tsx"
import { Calendar } from "./views/Calendar.tsx"
import { Clock } from "./views/Clock.tsx"
import { ExternalView } from "./views/ExternalView.tsx"
import { NowPlaying } from "./views/NowPlaying.tsx"
import { PhotoFrame } from "./views/PhotoFrame.tsx"
import { Queue } from "./views/Queue.tsx"
import { Weather } from "./views/Weather.tsx"

/**
 * Maps a view's `clientId` (from the server's browser view registry, delivered
 * over the WebSocket `view` message) to its component. An unknown id falls back
 * to Now Playing.
 */
export const viewByClientId: Record<string, ComponentType> =
  {
    "now-playing": NowPlaying,
    queue: Queue,
    ambient: Ambient,
    clock: Clock,
    weather: Weather,
    calendar: Calendar,
    "photo-frame": PhotoFrame,
  }

/**
 * Root: applies the dynamic settings (rotation as a CSS transform so an HA
 * automation can flip a motorized mount live; theme), the circle-safe inset
 * for round panels, and swaps views on the WebSocket `view` message — no
 * reloads, ever.
 *
 * The stage also carries the view swipe, because a gesture that reveals a view
 * cannot live inside the view it replaces. A touch panel only: the handlers go
 * on when `hasTouch` is set, so a mouse-driven display behaves as it always
 * did.
 *
 * Lives here rather than in `main.tsx` so tests can mount the real root
 * without triggering that module's render/connect side effects.
 */
export const App = () => {
  const profile = device.value
  const { orientation, theme } = settings.value
  const isSideways =
    orientation === 90 || orientation === 270

  // The token palette hangs off `data-scheme` on <html>. Explicit settings
  // win; Auto follows the device system scheme, including later OS changes.
  useEffect(() => {
    const mediaQuery = window.matchMedia(
      "(prefers-color-scheme: dark)",
    )
    const applyScheme = () => {
      document.documentElement.dataset.scheme =
        theme === "Auto"
          ? mediaQuery.matches
            ? "dark"
            : "light"
          : theme.toLowerCase()
    }
    applyScheme()
    if (theme !== "Auto") {
      return undefined
    }
    mediaQuery.addEventListener("change", applyScheme)
    return () => {
      mediaQuery.removeEventListener("change", applyScheme)
    }
  }, [theme])

  /*
   * Re-stamp the Axis A panel facts on <html>. The page shell already wrote
   * them, so this changes nothing on a first load; it exists because the
   * profile arrives again on every reconnect, and a panel holds its page for
   * weeks. Without this, editing a display's `pixelGrid` in the admin panel
   * would need somebody to walk to the glass and reload it.
   *
   * `data-grayscale-text` is the derived one: whether subpixel antialiasing is
   * safe depends on the stripe AND on how the unit is hung, and `orientation`
   * is a live setting an HA automation can flip under a motorized mount.
   */
  useEffect(() => {
    if (!profile) {
      return
    }
    const { dataset } = document.documentElement
    dataset.repaint = profile.repaint
    dataset.panelDithering = String(
      profile.hasPanelDithering,
    )
    dataset.pixelGrid = profile.pixelGrid
    dataset.delivery = profile.delivery
    dataset.input = profile.hasTouch ? "touch" : "none"
    dataset.grayscaleText = String(
      getIsGrayscaleTextRequired({
        orientation,
        pixelGrid: profile.pixelGrid,
      }),
    )
    // The layout box, so a view can size against the panel rather than the
    // viewport. See the page shell for why the two differ on a rotated mount.
    const { style } = document.documentElement
    style.setProperty("--panel-width", `${profile.width}px`)
    style.setProperty(
      "--panel-height",
      `${profile.height}px`,
    )
    style.setProperty(
      "--panel-min",
      `${Math.min(profile.width, profile.height)}px`,
    )
  }, [
    orientation,
    profile?.delivery,
    profile?.hasPanelDithering,
    profile?.hasTouch,
    profile?.height,
    profile?.pixelGrid,
    profile?.repaint,
    profile?.width,
  ])

  if (!profile) {
    return (
      <div class="idle">
        <div class="idle-title">Unknown device</div>
      </div>
    )
  }

  const ActiveView = activeView.value.startsWith(
    "external-view:",
  )
    ? ExternalView
    : (viewByClientId[activeView.value] ?? NowPlaying)

  return (
    <div
      class={`stage shape-${profile.shape}${profile.hasTouch ? "" : " touchless"}`}
      data-theme={theme.toLowerCase()}
      data-castkit-ready="true"
      onPointerDown={
        profile.hasTouch ? beginViewSwipe : undefined
      }
      onPointerMove={
        profile.hasTouch ? trackViewSwipe : undefined
      }
      onPointerUp={
        profile.hasTouch ? endViewSwipe : undefined
      }
      onPointerCancel={
        profile.hasTouch ? cancelViewSwipe : undefined
      }
      style={{
        transform:
          orientation === 0
            ? undefined
            : `rotate(${orientation}deg)`,
        width: isSideways ? "100vh" : "100vw",
        height: isSideways ? "100vw" : "100vh",
      }}
    >
      <ActiveView />
    </div>
  )
}
