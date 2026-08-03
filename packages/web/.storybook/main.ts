import type { StorybookConfig } from "@storybook/react-vite"

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-docs"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  // The CC0 sample photos live at the repo root because both Storybooks use
  // them and they belong to no single package. Serving them at a stable
  // `/sample-photos/` URL keeps `dev` and `build` identical — see
  // assets/sample-photos/CREDITS.md.
  staticDirs: [
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
