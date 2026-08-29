import type { ComponentType } from "preact"
import { useEffect } from "preact/hooks"
import { activeView, device, settings } from "./state.ts"
import { Ambient } from "./views/Ambient.tsx"
import { Calendar } from "./views/Calendar.tsx"
import { Clock } from "./views/Clock.tsx"
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

  if (!profile) {
    return (
      <div class="idle">
        <div class="idle-title">Unknown device</div>
      </div>
    )
  }

  const ActiveView =
    viewByClientId[activeView.value] ?? NowPlaying

  return (
    <div
      class={`stage shape-${profile.shape}${profile.hasTouch ? "" : " touchless"}`}
      data-theme={theme.toLowerCase()}
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
