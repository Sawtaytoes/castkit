import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**"],
    name: "views",
    // Node-only: a view is a pure function of its props, so a test calls it
    // directly and walks the element tree it returns. No DOM, no renderer —
    // what these cover is the layout arithmetic (which rows fit the panel),
    // not the pixels. The preview renders and Storybook are the pixel signal.
    include: ["src/**/*.test.ts"],
  },
})
