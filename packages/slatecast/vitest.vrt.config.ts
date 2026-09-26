import { playwright } from "@vitest/browser-playwright"
import { defineConfig } from "vitest/config"
import baseConfig from "./vitest.config.ts"

/**
 * The visual-regression capture: `src/**\/*.vrt.tsx` only, each writing PNGs
 * into `VRT_ACTUAL_DIR` (the shared `vrt` workflow passes it absolute).
 *
 * A separate config, so `yarn test` never writes a picture and never asserts
 * on one: these files produce shots for reg-suit to compare, and the verdict
 * is the `vrt` check, not a test failure. Run it with `yarn vrt:capture`.
 *
 * The page's time zone and locale are pinned here rather than inherited from
 * the machine, because the platform views format with the browser's defaults.
 * The clock is pinned in each file with fake timers.
 */
const vrtActualDir = process.env.VRT_ACTUAL_DIR

if (!vrtActualDir) {
  throw new Error(
    "VRT_ACTUAL_DIR is not set. The capture writes its PNGs there.",
  )
}

// Spread, not `mergeConfig`: that CONCATENATES arrays, so `include` would
// keep the unit tests and every one of them would run here too.
export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    name: "slatecast-vrt",
    include: ["src/**/*.vrt.tsx"],
    provide: { vrtActualDir },
    browser: {
      ...baseConfig.test?.browser,
      provider: playwright({
        contextOptions: {
          locale: "en-US",
          timezoneId: "America/Chicago",
        },
      }),
    },
  },
})

declare module "vitest" {
  export interface ProvidedContext {
    vrtActualDir: string
  }
}
