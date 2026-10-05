import {
  createPlaywrightConfig,
  createViewportProjects,
} from "@charcuterie/playwright-config"

/**
 * E2E layer. The Vitest browser suite covers the SPA against a mocked socket;
 * these specs drive a real browser against the real server, so they cover the
 * seam that suite necessarily stubs — page shell, WebSocket upgrade, snapshot
 * assembly, and the device→MQTT command bridge.
 *
 * `.spec.ts` is Playwright, `.test.ts(x)` is Vitest; the root vitest config
 * excludes `e2e/**` because @playwright/test's globals aren't compatible.
 *
 * The four window projects (`chromium-narrow`, `-tall`, `-wide`,
 * `-ultrawide`), CI-aware retries/workers and trace-on-first-retry come from
 * `@charcuterie/playwright-config`; what stays here is CastKit's own — where
 * the specs live, and the servers they drive.
 *
 * ⚠️ ONE SERVER PER WINDOW. The test server is stateful — the recording MQTT
 * stub, the published Home Assistant state the serial specs build up, and the
 * management PIN's five-attempts-a-minute limit. Four windows against one
 * server ran the same specs four times over shared state: the fifth sign-in
 * in a minute answered 429, and one window's published track landed in
 * another window's page. Each window gets its own server on its own port.
 */
const basePort = Number(process.env.PORT ?? 3100)

const windowProjects = createViewportProjects().map(
  (project, index) => ({
    ...project,
    use: {
      ...project.use,
      baseURL: `http://localhost:${basePort + index}`,
    },
  }),
)

/**
 * The server serves the built SPA from SLATECAST_DIST_DIR, so the FIRST
 * server builds it. Playwright starts `webServer` entries one after another
 * and waits for each `url`, so the others start after the build is done and
 * only serve it.
 */
const buildCommand =
  "yarn workspace @castkit/slatecast build && yarn workspace @castkit/admin build"

export default createPlaywrightConfig({
  testDir: "./e2e",
  reporter: process.env.CI ? "github" : "list",
  projects: windowProjects,
  webServer: windowProjects.map((_project, index) => {
    const port = basePort + index
    return {
      command:
        index === 0
          ? `${buildCommand} && yarn tsx e2e/serve.ts`
          : "yarn tsx e2e/serve.ts",
      url: `http://localhost:${port}/d/e2e-square`,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe" as const,
      stderr: "pipe" as const,
      timeout: 120 * 1000,
      env: {
        SLATECAST_DIST_DIR: "packages/slatecast/dist",
        PORT: String(port),
      },
    }
  }),
})
