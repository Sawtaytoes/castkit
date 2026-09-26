import type { Preview } from "@storybook/preact-vite"
import { BROWSER_DEVICE_PROFILES } from "../src/stories/deviceProfiles.ts"
import { freezeClockUnderAutomation } from "../src/stories/freezeClockUnderAutomation.ts"
import "../src/styles.css"

// Before any story module loads: the fixtures read the clock at import time.
// A no-op for a person; see the function for why the capture needs it.
freezeClockUnderAutomation()

/**
 * Every panel CastKit drives, offered in the toolbar's viewport list.
 *
 * A view story already renders inside a frame of its own panel's size, so this
 * list is not what makes a story correct — see `src/stories/panelFrame.tsx` for
 * why it cannot be. It is here so any story can be re-checked at any other
 * panel's size without editing code, and so the list names the screens this
 * project actually targets rather than Storybook's generic phone and tablet
 * presets, which match no device in the house.
 */
const panelViewports = Object.fromEntries(
  BROWSER_DEVICE_PROFILES.map((device) => [
    device.id,
    {
      name: `${device.label} — ${device.width}x${device.height}`,
      styles: {
        height: `${device.height}px`,
        width: `${device.width}px`,
      },
      type: "other" as const,
    },
  ]),
)

/*
  There is no Mock Service Worker here any more. It used to answer the app's
  image endpoints, and a service worker has to register, activate and claim the
  page before the first `<img>` fires — when it lost that race the Photo Frame
  story showed "No photos configured". The sample photos below are served as
  static files instead, which cannot lose a race. `msw` is still a dependency:
  the test harness uses it for the WebSocket, where there is no static
  equivalent.
*/
const preview: Preview = {
  parameters: {
    layout: "fullscreen",
    viewport: { options: panelViewports },
  },
}

export default preview
