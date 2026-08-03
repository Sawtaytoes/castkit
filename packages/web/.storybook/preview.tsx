import type { Preview } from "@storybook/react-vite"
import { installPanelFonts } from "../src/storybook/panelFontFaceCss.ts"

/*
  Install the panel faces before anything renders. Without this every story
  falls back to the browser's system sans-serif while the device renders in
  Atkinson Hyperlegible — so the preview mismeasures text, and any overflow
  judgement made against it is made against the wrong metrics.
*/
void installPanelFonts()

/**
 * Views draw a white card at an exact pixel size, so a plain white Storybook
 * canvas would hide the panel edge. Wrap every story in a grey mat + thin border
 * so the panel boundary is visible at its true dimensions. That border is the
 * mat — it is not a crop; crop insets are a separate, explicit control.
 */
const preview: Preview = {
  parameters: {
    layout: "centered",
    controls: { expanded: true },
  },
  decorators: [
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
