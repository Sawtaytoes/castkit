import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/render-output/**",
      // Playwright specs have their own runner (`yarn e2e`); @playwright/test's
      // describe/test globals are not compatible with vitest.
      "e2e/**",
    ],
    projects: [
      "packages/core/vitest.config.ts",
      "packages/shared/vitest.config.ts",
      "packages/render/vitest.config.ts",
      "packages/server/vitest.config.ts",
      "packages/slatecast/vitest.config.ts",
    ],
  },
})
