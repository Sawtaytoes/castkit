// Smoke test for the built desktop app: start it against a local stand-in for
// a CastKit server and check the behavior a unit test cannot reach — a window
// opens on its page, its zoom follows the view on screen, keys change and save
// zoom, the page is sandboxed, navigation to another origin is refused, and
// quitting keeps the window for the next launch.
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
        screens: [{ id: "test", name: "Test" }],
      }),
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
  server.listen(0, "127.0.0.1", resolve),
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
const app = await electron.launch({
  args: [packageDirectory, "--no-sandbox"],
  env: {
    ...process.env,
    CASTKIT_DESKTOP_STATE_FILE: stateFile,
  },
})
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

try {
  const page = await app.firstWindow()
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
    "F11 enters fullscreen and saves it",
    async () => {
      await pressKey({ keyCode: "F11" })
      await waitFor(
        () => readState().windows[0]?.isFullScreen === true,
        "isFullScreen in the state file",
      )
    },
  )

  mkdirSync(screenshotDirectory, { recursive: true })
  await page.screenshot({
    path: join(screenshotDirectory, "desktop-smoke.png"),
  })
} finally {
  await app.close()
  server.close()
}

await check(
  "quitting keeps the window for the next launch",
  async () => {
    const state = readState()
    assert.equal(state.windows.length, 1)
    assert.equal(state.windows[0].id, "window-5a0e7e57")
    assert.equal(state.serverOrigin, serverOrigin)
  },
)

rmSync(stateDirectory, { recursive: true, force: true })
console.info(`\n${results.length} checks passed.`)
console.info(logLines.join("").trim())
