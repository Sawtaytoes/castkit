import { createPlaywrightConfig } from "@charcuterie/playwright-config"

/**
 * E2E layer. The Vitest browser suite covers the SPA against a mocked socket;
 * these specs drive a real browser against the real server, so they cover the
 * seam that suite necessarily stubs — page shell, WebSocket upgrade, snapshot
 * assembly, and the device→MQTT command bridge.
 *
 * `.spec.ts` is Playwright, `.test.ts(x)` is Vitest; the root vitest config
 * excludes `e2e/**` because @playwright/test's globals aren't compatible.
 *
 * The chromium project, CI-aware retries/workers and trace-on-first-retry come
 * from `@charcuterie/playwright-config`; what stays here is CastKit's own —
 * where the specs live, and the server they drive.
 */
const port = Number(process.env.PORT ?? 3100)

export default createPlaywrightConfig({
  testDir: "./e2e",
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${port}`,
  },
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
