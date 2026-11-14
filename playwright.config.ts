import {
  createPlaywrightConfig,
  createViewportProjects,
} from "@charcuterie/playwright-config"
import {
  type ViewportName,
  viewportNames,
} from "@charcuterie/vitest-config/viewports.js"

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
 * management PIN's limit of five rejected PINs a minute. Four windows against
 * one server ran the same specs four times over shared state: the fifth
 * sign-in in a minute answered 429 (every sign-in counted then), and one
 * window's published track landed in another window's page. Each window gets
 * its own server on its own port.
 */
const basePort = Number(process.env.PORT ?? 3100)

/**
 * `CASTKIT_E2E_WINDOWS=wide` (or `narrow,tall`) runs only those windows and
 * starts only their servers. CI runs each window as its own job this way;
 * unset, every window runs. An unknown name fails the run rather than
 * quietly testing nothing.
 */
const selectedWindows = (() => {
  const names = (process.env.CASTKIT_E2E_WINDOWS ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
  if (names.length === 0) return viewportNames
  const unknown = names.filter(
    (name) =>
      !(viewportNames as readonly string[]).includes(name),
  )
  if (unknown.length)
    throw new Error(
      `CASTKIT_E2E_WINDOWS names unknown windows: ${unknown.join(", ")}. Use ${viewportNames.join(", ")}.`,
    )
  return names as ViewportName[]
})()

const windowProjects = createViewportProjects(
  selectedWindows,
).map((project, index) => ({
  ...project,
  use: {
    ...project.use,
    baseURL: `http://localhost:${basePort + index}`,
  },
}))

/**
 * The server serves the built SPA from SLATECAST_DIST_DIR, so the FIRST
 * server builds it. Playwright starts `webServer` entries one after another
 * and waits for each `url`, so the others start after the build is done and
 * only serve it.
 */
const buildCommand =
  "pnpm --filter @castkit/slatecast build && pnpm --filter @castkit/admin build"

export default createPlaywrightConfig({
  testDir: "./e2e",
  reporter: process.env.CI ? "github" : "list",
  /*
   * ⚠️ ONE WORKER, everywhere. A window's specs share that window's stateful
   * server (above), so two workers on one window run two specs against the
   * same published channels and display holds at once: on 2026-11-14 two
   * `chooserPosterFit` cases published 3 and 4 posters to one channel and
   * one read the other's. The shared default is one worker on CI but half
   * the cores locally. To go faster, run windows side by side as separate
   * runs, each with its own `CASTKIT_E2E_WINDOWS` and `PORT`.
   */
  workers: 1,
  projects: windowProjects,
  webServer: windowProjects.map((_project, index) => {
    const port = basePort + index
    return {
      command:
        index === 0
          ? `${buildCommand} && pnpm tsx e2e/serve.ts`
          : "pnpm tsx e2e/serve.ts",
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
