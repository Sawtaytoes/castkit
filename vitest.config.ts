import { createVitestConfig } from "@charcuterie/vitest-config"

export default createVitestConfig({
  test: {
    // The root config only aggregates the projects below; each one declares
    // its own environment. `slatecast` is the single browser project and
    // brings its own provider, so the shared browser default is off here.
    browser: { enabled: false },
    exclude: [
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
      "packages/views/vitest.config.ts",
      "packages/web/vitest.config.ts",
    ],
  },
})
