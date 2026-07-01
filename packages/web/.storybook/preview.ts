import type { Preview } from "@storybook/react-vite"
import { createElement } from "react"

/**
 * Views draw a white card at an exact pixel size, so a plain white Storybook
 * canvas would hide the panel edge. Wrap every story in a grey mat + thin border
 * so the panel boundary is visible at its true dimensions.
 */
const preview: Preview = {
  parameters: {
    layout: "centered",
    controls: { expanded: true },
  },
  decorators: [
    (Story) =>
      createElement(
        "div",
        {
          style: {
            padding: 24,
            backgroundColor: "#d0d0d0",
            display: "inline-block",
          },
        },
        createElement(
          "div",
          { style: { border: "1px solid #808080" } },
          createElement(Story),
        ),
      ),
  ],
}

export default preview
