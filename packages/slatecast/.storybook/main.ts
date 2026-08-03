import type { StorybookConfig } from "@storybook/preact-vite"

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-docs", "msw-storybook-addon"],
  framework: {
    name: "@storybook/preact-vite",
    options: {},
  },
  // `public/` carries MSW's service worker; the sample photos are shared from
  // the repo root, served at the same `/sample-photos/` path the ePaper
  // Storybook uses. See assets/sample-photos/CREDITS.md.
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
