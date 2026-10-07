import {
  createCiTimeouts,
  createViewportInstances,
} from "@charcuterie/vitest-config"
import preact from "@preact/preset-vite"
import { playwright } from "@vitest/browser-playwright"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [preact()],
  test: {
    name: "slatecast",
    // .tsx too — the sibling node projects only glob .ts because they have
    // no components.
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    // Four windows multiply the runner's load; this hand-rolled config
    // never had the shared factory's CI budget, so it takes it here.
    ...createCiTimeouts(),
    // Real Chromium, not jsdom: SeekBar divides by getBoundingClientRect()
    // width and calls setPointerCapture, and accentColor reads canvas pixels
    // via getImageData — all three are dead ends under jsdom. Mirrors
    // mux-magic's locked "packages/web runs in real Chromium" decision.
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      // Every test runs once in each of the fleet's four windows
      // (`slatecast-narrow`, `-tall`, `-wide`, `-ultrawide`). A test that
      // sizes the page to a PANEL with `page.viewport()` is asserting on
      // that panel's own canvas, which is window-independent; the four
      // windows are the browser around it.
      instances: createViewportInstances({
        project: "slatecast",
      }),
    },
    setupFiles: ["./vitest.setup.ts"],
  },
  // Pre-declare every browser-mode test dep so Vite optimizes them all at
  // startup. Without this, Vite discovers deps as tests run, kicks off a
  // re-optimization and reloads the page mid-test. The race hides behind a
  // warm node_modules/.vite cache locally and reproduces on every cold CI
  // run. Same fix, same reasoning as mux-magic's web project.
  optimizeDeps: {
    include: [
      "@charcuterie/vitest-config/viewports.js",
      "@preact/signals",
      "@testing-library/jest-dom/vitest",
      "@testing-library/preact",
      "@testing-library/user-event",
      // Only the subpaths — the bare "msw" entry is a node/browser
      // conditional export and esbuild refuses to pre-bundle it.
      "msw/browser",
      "msw/core/ws",
      "preact",
      "preact/hooks",
      "preact/jsx-runtime",
    ],
  },
})
