import type {
  Decorator,
  Preview,
} from "@storybook/react-vite"
import { installPanelFonts } from "../src/storybook/panelFontFaceCss.ts"

/*
  Install the panel faces before anything renders. Without this every story
  falls back to the browser's system sans-serif while the device renders in
  Atkinson Hyperlegible — so the preview mismeasures text, and any overflow
  judgment made against it is made against the wrong metrics.
*/
void installPanelFonts()

/**
 * Views draw a white card at an exact pixel size, so a plain white Storybook
 * canvas would hide the panel edge. Wrap every story in a gray mat + thin border
 * so the panel boundary is visible at its true dimensions. That border is the
 * mat — it is not a crop; crop insets are a separate, explicit control.
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
 * `daylight`'s dark `surface.base`, the color the composed site's own chrome
 * paints. A literal because this Storybook does not load the token CSS.
 */
const DARK_CANVAS = "#131822"

/**
 * The canvas around the mat follows the composed site's Scheme toolbar, which
 * `storybook.octen.dev` shares with every ref as the `scheme` global (`dark` by
 * default). Left alone the canvas was bright white beside a dark site. The mat
 * and the panel inside it do not change: the mat is what marks the panel edge,
 * and the panel is what the ePaper glass shows.
 */
const withCanvasScheme: Decorator = (Story, context) => {
  document.body.style.backgroundColor =
    context.globals.scheme === "dark" ? DARK_CANVAS : ""
  return <Story />
}

const preview: Preview = {
  parameters: {
    layout: "centered",
    controls: { expanded: true },
  },
  decorators: [
    withCanvasScheme,
    (Story) => (
      <div
        style={{
          padding: 24,
          backgroundColor: "#d0d0d0",
          display: "inline-block",
        }}
      >
        <div style={{ border: "1px solid #808080" }}>
          <Story />
        </div>
      </div>
    ),
  ],
}

export default preview
