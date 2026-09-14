import type { StorybookConfig } from "@storybook/preact-vite"

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-docs"],
  framework: {
    name: "@storybook/preact-vite",
    options: {},
  },
  // The sample photos are shared from the repo root, served at the same
  // `/sample-photos/` path the ePaper Storybook uses, and are what every image
  // view's story shows. See assets/sample-photos/CREDITS.md.
  staticDirs: [
    "../public",
    {
      from: "../../../assets/sample-photos",
      to: "/sample-photos",
    },
  ],
  core: {
    disableTelemetry: true,
  },
}

export default config
