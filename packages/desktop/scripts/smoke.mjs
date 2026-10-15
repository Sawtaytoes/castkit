// Smoke test for the built desktop app: start it against a local stand-in for
// a CastKit server and check the behavior a unit test cannot reach — a window
// opens on its page, its zoom follows the view on screen, keys change and save
// zoom, the page is sandboxed, navigation to another origin is refused, a
// sign-in in one window reaches the other, closing a window keeps it, the
// settings page lists the server's pages, and quitting keeps every window for
// the next launch.
//
// Needs Electron's binary (`pnpm exec install-electron`) and a display; on a
// Linux machine without one, run it under `xvfb-run`. Run `pnpm build` first
// (`pnpm smoke` does both).
import assert from "node:assert/strict"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { _electron as electron } from "playwright"

const packageDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
)
const screenshotDirectory = join(
  packageDirectory,
  "..",
  "..",
  "__screenshots__",
)

const pageHtml = `<!doctype html><html><head><title>Smoke screen</title></head>
<body style="margin: 0; background: #fff; color: #111"><main class="platform" data-view="agenda">
<h1 style="font: 48px sans-serif">CastKit smoke page</h1>
</main></body></html>`

const server = createServer((request, response) => {
  if (request.url === "/api/views") {
    response.writeHead(200, {
      "content-type": "application/json",
    })
    response.end(
      JSON.stringify({
        views: [],
        screens: [
          { id: "test", name: "Test", viewIds: [] },
        ],
      }),
    )
    return
  }
  if (request.url === "/sign-in") {
    response.writeHead(204, {
      "set-cookie":
        "castkit-session=smoke-token; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600",
    })
    response.end()
    return
  }
  if (request.url === "/sign-out") {
    response.writeHead(204, {
      "set-cookie":
        "castkit-session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
    })
    response.end()
    return
  }
  if (request.url === "/screen/other") {
    response.writeHead(200, { "content-type": "text/html" })
    response.end(
      '<!doctype html><title>Other</title><main data-view="other">Other</main>',
    )
    return
  }
  if (request.url === "/screen/test") {
    response.writeHead(200, { "content-type": "text/html" })
    response.end(pageHtml)
    return
  }
  response.writeHead(404)
  response.end("Not found")
})
await new Promise((resolve) =>
  server.listen(0, "0.0.0.0", resolve),
)
const { port } = server.address()
const serverOrigin = `http://127.0.0.1:${port}`

const stateDirectory = mkdtempSync(
  join(tmpdir(), "castkit-desktop-smoke-"),
)
const stateFile = join(stateDirectory, "desktop-state.json")
writeFileSync(
  stateFile,
  JSON.stringify({
    version: 1,
    serverOrigin,
    windows: [
      {
        id: "window-5a0e7e57",
        url: `${serverOrigin}/screen/test`,
        displayId: 424242,
        displayLabel: "A monitor that is not connected",
        displayBounds: {
          x: 9000,
          y: 0,
          width: 800,
          height: 480,
        },
        windowBounds: {
          x: 9000,
          y: 0,
          width: 800,
          height: 480,
        },
        isFullScreen: false,
        zoomByView: { "view:agenda": 1.25 },
      },
      {
        id: "window-5a0e7e58",
        url: `${serverOrigin}/screen/other`,
        displayId: 424242,
        displayLabel: "A monitor that is not connected",
        displayBounds: {
          x: 9000,
          y: 0,
          width: 800,
          height: 480,
        },
        windowBounds: {
          x: 9000,
          y: 0,
          width: 800,
          height: 480,
        },
        isFullScreen: false,
        zoomByView: {},
      },
    ],
  }),
)
const readState = () =>
  JSON.parse(readFileSync(stateFile, "utf8"))

const waitFor = async (check, description) => {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (await check()) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Timed out waiting for ${description}.`)
}

const logLines = []
// Isolate the actual Electron userData, not just the JSON state: sessions,
// cookies, the single-instance lock and Chromium storage belong to this run.
const entryFile = join(stateDirectory, "smoke-main.cjs")
writeFileSync(
  entryFile,
  `
const { app, session, shell } = require("electron")
const { existsSync, writeFileSync } = require("node:fs")
app.setPath("userData", ${JSON.stringify(join(stateDirectory, "profile"))})
shell.openExternal = async (url) => { globalThis.smokeExternalUrl = url }
void app.whenReady().then(async () => {
  const marker = ${JSON.stringify(join(stateDirectory, "seeded"))}
  if (!existsSync(marker)) {
    await session.fromPartition("persist:castkit-window-window-5a0e7e58").cookies.set({
      url: ${JSON.stringify(serverOrigin)}, name: "castkit-session", value: "restored-token", path: "/", httpOnly: true,
    })
    writeFileSync(marker, "seeded")
  }
  require(${JSON.stringify(join(packageDirectory, "dist", "main.cjs"))})
})
`,
)
const launch = () =>
  electron.launch({
    args: [entryFile, "--no-sandbox"],
    env: {
      ...process.env,
      CASTKIT_DESKTOP_STATE_FILE: stateFile,
    },
  })
const app = await launch()
app
  .process()
  .stdout.on("data", (chunk) =>
    logLines.push(String(chunk)),
  )
app
  .process()
  .stderr.on("data", (chunk) =>
    logLines.push(String(chunk)),
  )

// Playwright's keyboard goes through the DevTools protocol, which skips
// Electron's `before-input-event`; `sendInputEvent` is the native input path
// a real key press takes.
const pressKey = ({ keyCode, modifiers = [] }) =>
  app.evaluate(
    ({ webContents }, key) => {
      const contents = webContents
        .getAllWebContents()
        .find((candidate) =>
          candidate.getURL().includes("/screen/test"),
        )
      contents.sendInputEvent({ type: "keyDown", ...key })
      contents.sendInputEvent({ type: "keyUp", ...key })
    },
    { keyCode, modifiers },
  )

const results = []
const check = async (name, run) => {
  await run()
  results.push(name)
  console.info(`ok - ${name}`)
}

mkdirSync(screenshotDirectory, { recursive: true })

try {
  await waitFor(
    () =>
      app
        .windows()
        .some((candidate) =>
          candidate.url().includes("/screen/test"),
        ),
    "the test window",
  )
  const page = app
    .windows()
    .find((candidate) =>
      candidate.url().includes("/screen/test"),
    )
  await page.waitForLoadState("domcontentloaded")
  const readZoom = () =>
    app.evaluate(({ webContents }) =>
      webContents
        .getAllWebContents()
        .find((contents) =>
          contents.getURL().includes("/screen/test"),
        )
        ?.getZoomFactor(),
    )

  await check(
    "the saved window opens on its page",
    async () => {
      assert.equal(
        page.url(),
        `${serverOrigin}/screen/test`,
      )
    },
  )

  await check(
    "a window whose monitor is missing opens on the primary display",
    async () => {
      await waitFor(
        () =>
          app.evaluate(({ BrowserWindow, screen }) =>
            BrowserWindow.getAllWindows().some(
              (window) =>
                window.isVisible() &&
                screen.getDisplayMatching(
                  window.getBounds(),
                ).id === screen.getPrimaryDisplay().id,
            ),
          ),
        "a visible window on the primary display",
      )
    },
  )

  await check(
    "the window has its own session partition",
    async () => {
      const storagePaths = await app.evaluate(
        ({ BrowserWindow }) =>
          BrowserWindow.getAllWindows().map(
            (window) =>
              window.webContents.session.storagePath,
          ),
      )
      assert.ok(
        storagePaths.some((path) =>
          path?.includes("castkit-window-window-5a0e7e57"),
        ),
        `expected a castkit-window partition, got ${JSON.stringify(storagePaths)}`,
      )
    },
  )

  await check(
    "the saved zoom for the view on screen is applied",
    async () => {
      await waitFor(
        async () => (await readZoom()) === 1.25,
        "zoom 1.25 on the agenda view",
      )
    },
  )

  await check(
    "switching the view switches to that view's zoom",
    async () => {
      await page.evaluate(() =>
        document
          .querySelector("main")
          .setAttribute("data-view", "music"),
      )
      await waitFor(
        async () => (await readZoom()) === 1,
        "zoom 1 on the music view",
      )
    },
  )

  await check(
    "Ctrl = zooms in and saves the factor for the view",
    async () => {
      await pressKey({
        keyCode: "=",
        modifiers: ["control"],
      })
      await waitFor(
        async () => (await readZoom()) === 1.1,
        "zoom 1.1 after Ctrl =",
      )
      await waitFor(
        () =>
          readState().windows[0]?.zoomByView[
            "view:music"
          ] === 1.1,
        "the saved zoom for the music view",
      )
      assert.deepEqual(readState().windows[0].zoomByView, {
        "view:agenda": 1.25,
        "view:music": 1.1,
      })
    },
  )

  await check(
    "the page has no Node and no Electron",
    async () => {
      assert.deepEqual(
        await page.evaluate(() => [
          typeof require,
          typeof process,
          typeof window.castkitDesktop,
        ]),
        ["undefined", "undefined", "undefined"],
      )
    },
  )

  await check(
    "navigation to another origin is refused",
    async () => {
      await page.evaluate((target) => {
        window.location.href = target
      }, `http://localhost:${port}/screen/test`)
      await new Promise((resolve) =>
        setTimeout(resolve, 1000),
      )
      assert.equal(
        page.url(),
        `${serverOrigin}/screen/test`,
      )
    },
  )

  await check(
    "a saved sign-in in the second window unlocks the first window at startup",
    async () => {
      await waitFor(
        () =>
          app.evaluate(async ({ session }) => {
            const [cookie] = await session
              .fromPartition(
                "persist:castkit-window-window-5a0e7e57",
              )
              .cookies.get({ name: "castkit-session" })
            return cookie?.value === "restored-token"
          }),
        "the restored sign-in in the first window",
      )
    },
  )

  await check(
    "a sign-in in one window reaches the other window",
    async () => {
      await page.evaluate(() =>
        fetch("/sign-in", { credentials: "include" }),
      )
      await waitFor(
        () =>
          app.evaluate(async ({ session }) => {
            const cookies = await session
              .fromPartition(
                "persist:castkit-window-window-5a0e7e58",
              )
              .cookies.get({ name: "castkit-session" })
            return cookies[0]?.value === "smoke-token"
          }),
        "the sign-in cookie in the other window",
      )
    },
  )

  await check(
    "closing a window keeps it, closed",
    async () => {
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()
          .find((window) =>
            window.webContents
              .getURL()
              .includes("/screen/other"),
          )
          ?.close()
      })
      await waitFor(
        () => readState().windows[1]?.isClosed === true,
        "isClosed in the state file",
      )
      assert.equal(readState().windows.length, 2)
    },
  )

  await check(
    "the settings page lists the server's pages",
    async () => {
      await app.evaluate(({ app: electronApp }) => {
        electronApp.emit("second-instance")
      })
      await waitFor(
        () =>
          app
            .windows()
            .some((candidate) =>
              candidate
                .url()
                .includes("settings/index.html"),
            ),
        "the settings window",
      )
      const settingsPage = app
        .windows()
        .find((candidate) =>
          candidate.url().includes("settings/index.html"),
        )
      await settingsPage
        .getByRole("button", {
          name: "Open Test (/screen/test)",
        })
        .waitFor()
      await settingsPage.screenshot({
        path: join(
          screenshotDirectory,
          "desktop-settings.png",
        ),
      })
      // Starting CastKit again opened the closed window too.
      await waitFor(
        () => readState().windows[1]?.isClosed === false,
        "the closed window open again",
      )
    },
  )

  const settingsPage = app
    .windows()
    .find((candidate) =>
      candidate.url().includes("settings/index.html"),
    )
  await check(
    "removing a signed-in window keeps the other windows signed in",
    async () => {
      const before = await settingsPage.evaluate(() =>
        window.castkitDesktop.readSettings(),
      )
      const result = await settingsPage.evaluate(
        (displayId) =>
          window.castkitDesktop.addWindow({
            page: "/screen/other",
            displayId,
            isFullScreen: false,
          }),
        before.displays[0].id,
      )
      assert.equal(result.isDone, true)
      await waitFor(
        () => readState().windows.length === 3,
        "the third window",
      )
      const thirdId = readState().windows[2].id
      await waitFor(
        () =>
          app.evaluate(async ({ session }, partition) => {
            const [cookie] = await session
              .fromPartition(partition)
              .cookies.get({ name: "castkit-session" })
            return cookie?.value === "smoke-token"
          }, `persist:castkit-window-${thirdId}`),
        "the third window signed in",
      )
      await settingsPage.evaluate(
        (windowId) =>
          window.castkitDesktop.removeWindow(windowId),
        thirdId,
      )
      await waitFor(
        () => readState().windows.length === 2,
        "the third window removed",
      )
      const [cookie] = await app.evaluate(
        async ({ session }) =>
          session
            .fromPartition(
              "persist:castkit-window-window-5a0e7e57",
            )
            .cookies.get({ name: "castkit-session" }),
      )
      assert.equal(cookie?.value, "smoke-token")
    },
  )

  await check(
    "changing servers does not copy the old server's sign-in to a newly opened window",
    async () => {
      const otherOrigin = `http://127.0.0.2:${port}`
      await settingsPage.evaluate(
        (origin) =>
          window.castkitDesktop.saveServerOrigin(origin),
        otherOrigin,
      )
      await waitFor(
        () => readState().serverOrigin === otherOrigin,
        "the new server address",
      )
      const current = await settingsPage.evaluate(() =>
        window.castkitDesktop.readSettings(),
      )
      await settingsPage.evaluate(
        (displayId) =>
          window.castkitDesktop.addWindow({
            page: "/screen/other",
            displayId,
            isFullScreen: false,
          }),
        current.displays[0].id,
      )
      await waitFor(
        () => readState().windows.length === 3,
        "the new server's third window",
      )
      const thirdId = readState().windows[2].id
      // Wait for attach + initial load, then inspect the real cookie store.
      await waitFor(
        () =>
          app
            .windows()
            .some(
              (candidate) =>
                candidate.url() ===
                `${otherOrigin}/screen/other`,
            ),
        "a page on the new server",
      )
      const cookies = await app.evaluate(
        async ({ session }, { partition, origin }) =>
          session.fromPartition(partition).cookies.get({
            url: origin,
            name: "castkit-session",
          }),
        {
          partition: `persist:castkit-window-${thirdId}`,
          origin: otherOrigin,
        },
      )
      assert.equal(cookies.length, 0)
      await settingsPage.evaluate(
        (windowId) =>
          window.castkitDesktop.removeWindow(windowId),
        thirdId,
      )
      await settingsPage.evaluate(
        (origin) =>
          window.castkitDesktop.saveServerOrigin(origin),
        serverOrigin,
      )
      await page.waitForURL(`${serverOrigin}/screen/test`)
    },
  )

  await check(
    "signing out removes the cookie from every window",
    async () => {
      await page.evaluate(() =>
        fetch("/sign-out", { credentials: "include" }),
      )
      await waitFor(
        () =>
          app.evaluate(async ({ session }) => {
            const cookies = await session
              .fromPartition(
                "persist:castkit-window-window-5a0e7e58",
              )
              .cookies.get({ name: "castkit-session" })
            return cookies.length === 0
          }),
        "sign-out in the other window",
      )
    },
  )

  await check(
    "F11 enters fullscreen and saves it",
    async () => {
      await pressKey({ keyCode: "F11" })
      await waitFor(
        () => readState().windows[0]?.isFullScreen === true,
        "isFullScreen in the state file",
      )
    },
  )

  await check(
    "Alt in fullscreen opens the window menu",
    async () => {
      // A native menu cannot be screenshotted; record the popup instead.
      await app.evaluate(({ Menu }) => {
        globalThis.smokePopupLabels = null
        Menu.prototype.popup = function recordPopup() {
          globalThis.smokePopupLabels = this.items.map(
            (item) => item.label,
          )
        }
      })
      await pressKey({ keyCode: "Alt" })
      await waitFor(
        () =>
          app.evaluate(
            () => globalThis.smokePopupLabels !== null,
          ),
        "the window menu",
      )
      const labels = await app.evaluate(
        () => globalThis.smokePopupLabels,
      )
      assert.ok(labels.includes("Move to display"))
      assert.ok(labels.includes("Server and settings…"))
    },
  )

  await page.screenshot({
    path: join(screenshotDirectory, "desktop-smoke.png"),
  })
  await check(
    "navigation is saved for restart, including an in-page change",
    async () => {
      await page.goto(`${serverOrigin}/screen/other`)
      await page.evaluate(() =>
        history.pushState(
          {},
          "",
          "/screen/other?mode=board#details",
        ),
      )
      await waitFor(
        () =>
          readState().windows[0].url ===
          `${serverOrigin}/screen/other?mode=board#details`,
        "the navigated URL in saved state",
      )
    },
  )
} finally {
  await app.close()
}

await check(
  "quitting keeps the window for the next launch",
  async () => {
    const state = readState()
    assert.equal(state.windows.length, 2)
    assert.equal(state.windows[0].id, "window-5a0e7e57")
    assert.equal(state.serverOrigin, serverOrigin)
  },
)

const restarted = await launch()
try {
  await check(
    "a fresh Electron process restores the navigated page and fullscreen state",
    async () => {
      await waitFor(
        () =>
          restarted
            .windows()
            .some(
              (candidate) =>
                candidate.url() ===
                `${serverOrigin}/screen/other?mode=board#details`,
            ),
        "the saved page after restart",
      )
      await waitFor(
        () =>
          restarted.evaluate(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows().some(
              (window) =>
                window.webContents
                  .getURL()
                  .includes("?mode=board#details") &&
                window.isFullScreen(),
            ),
          ),
        "fullscreen after restart",
      )
    },
  )
} finally {
  await restarted.close()
  server.close()
  rmSync(stateDirectory, { recursive: true, force: true })
}
console.info(`\n${results.length} checks passed.`)
console.info(logLines.join("").trim())
