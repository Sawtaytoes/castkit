import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**"],
    name: "web",
    // Node-only: these cover the story catalog's coverage guarantees and the
    // panel/palette wiring. The rasterizer and dither preview need a real
    // canvas and are deliberately not unit-tested — the Storybook build is
    // their CI signal.
    include: ["src/**/*.test.ts"],
  },
})
