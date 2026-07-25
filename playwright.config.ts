import { defineConfig, devices } from "@playwright/test"

/**
 * E2E layer. The Vitest browser suite covers the SPA against a mocked socket;
 * these specs drive a real browser against the real server, so they cover the
 * seam that suite necessarily stubs — page shell, WebSocket upgrade, snapshot
 * assembly, and the device→MQTT command bridge.
 *
 * `.spec.ts` is Playwright, `.test.ts(x)` is Vitest; the root vitest config
 * excludes `e2e/**` because @playwright/test's globals aren't compatible.
 */
const port = Number(process.env.PORT ?? 3100)

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // The server serves the built SPA from SLATECAST_DIST_DIR, so build first.
    command:
      "yarn workspace @castkit/slatecast build && yarn tsx e2e/serve.ts",
    url: `http://localhost:${port}/d/e2e-square`,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 120 * 1000,
    env: {
      SLATECAST_DIST_DIR: "packages/slatecast/dist",
      PORT: String(port),
    },
  },
})
