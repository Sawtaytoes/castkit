import type {
  Decorator,
  Preview,
} from "@storybook/preact-vite"
import { BROWSER_DEVICE_PROFILES } from "../src/stories/deviceProfiles.ts"
import { freezeClockUnderAutomation } from "../src/stories/freezeClockUnderAutomation.ts"
import { isPanelDocument } from "../src/stories/panelFrame.tsx"
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
/**
 * The composed site's `scheme` global, declared so this ref accepts it. No
 * default: standalone (localhost, the `vrt` capture) it stays unset and the
 * canvas keeps its old color, so the capture does not change.
 */
export const globalTypes = {
  scheme: {
    description:
      "The canvas around the panel: light or dark.",
    toolbar: {
      title: "Scheme",
      icon: "circlehollow",
      dynamicTitle: true,
      items: [
        { value: "dark", title: "Dark" },
        { value: "light", title: "Light" },
      ],
    },
  },
}

/**
 * The canvas AROUND a panel follows the composed site's Scheme toolbar.
 *
 * `storybook.octen.dev` declares a `scheme` global (`dark` by default) and
 * Storybook copies the host's globals into every composed ref. Nothing here
 * read it, so the outer document had no `data-scheme`, its `--bg` resolved to
 * the light surface, and every panel sat on a bright white canvas while the
 * site around it was dark. `styles.css` already paints `html, body` with `--bg`,
 * so stamping the scheme is the whole fix.
 *
 * The panel's own nested document is left alone: what the glass shows is the
 * view's business, not the reviewer's toolbar. A story that stamps its own
 * scheme (the Composed Dashboard) runs its decorator inside this one and wins.
 */
const withCanvasScheme: Decorator = (Story, context) => {
  const scheme = context.globals.scheme
  if (
    !isPanelDocument() &&
    (scheme === "dark" || scheme === "light")
  ) {
    document.documentElement.dataset.scheme = scheme
  }
  return <Story />
}

const preview: Preview = {
  decorators: [withCanvasScheme],
  parameters: {
    layout: "fullscreen",
    viewport: { options: panelViewports },
  },
}

export default preview
