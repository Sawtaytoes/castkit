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
import { execFileSync } from "node:child_process"
import { createSocket } from "node:dgram"
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

// Sending this computer's audio: a UDP listener stands in for Music
// Assistant's VBAN Receiver, and Chromium's fake capture device stands in for
// a real input, so the whole path from capture to packet runs on any runner.
const fakeInputLabel = "Fake Default Audio Input"
const vbanPackets = []
const vbanListener = createSocket("udp4")
vbanListener.on("message", (packet) => {
  vbanPackets.push(packet)
})
await new Promise((resolve) =>
  vbanListener.bind(0, "127.0.0.1", resolve),
)
const vbanPort = vbanListener.address().port

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
    pcAudio: {
      isSending: true,
      host: "127.0.0.1",
      port: vbanPort,
      streamName: "Smoke",
      inputDeviceLabel: fakeInputLabel,
    },
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
const launch = async () => {
  const launched = await electron.launch({
    args: [
      entryFile,
      "--no-sandbox",
      "--use-fake-device-for-media-stream",
    ],
    env: {
      ...process.env,
      CASTKIT_DESKTOP_STATE_FILE: stateFile,
    },
  })
  launched
    .process()
    .stdout.on("data", (chunk) =>
      logLines.push(String(chunk)),
    )
  launched
    .process()
    .stderr.on("data", (chunk) =>
      logLines.push(String(chunk)),
    )
  launched.process().on("exit", (code, signal) => {
    exitTimes.set(launched, {
      at: Date.now(),
      code,
      signal,
    })
  })
  return launched
}
const exitTimes = new WeakMap()
// What is still running when a quit stalls: the main process, or a child
// it left behind. Windows does not end a process's children with it.
const describeLeftovers = (launched, startedAt) => {
  const exit = exitTimes.get(launched)
  const lines = [
    exit
      ? `The main process exited after ${exit.at - startedAt} ms (code ${exit.code}, signal ${exit.signal}).`
      : "The main process is still running.",
  ]
  if (process.platform === "win32") {
    try {
      lines.push(
        execFileSync(
          "powershell",
          [
            "-NoProfile",
            "-Command",
            "Get-CimInstance Win32_Process -Filter \"Name='electron.exe'\" | ForEach-Object { \"$($_.ProcessId) parent $($_.ParentProcessId): $($_.CommandLine -replace '^.*?(--type=\\S+).*$', '$1')\" }",
          ],
          { encoding: "utf8", timeout: 15_000 },
        ).trim() || "No electron.exe is running.",
      )
    } catch (error) {
      lines.push(
        `Could not list processes: ${String(error)}`,
      )
    }
  }
  lines.push(
    "The app's last output:",
    logLines
      .join("")
      .trim()
      .split("\n")
      .slice(-30)
      .join("\n"),
  )
  return lines.join("\n")
}
const endProcessTree = (launched) => {
  const { pid } = launched.process()
  if (process.platform === "win32" && pid !== undefined) {
    try {
      execFileSync(
        "taskkill",
        ["/pid", String(pid), "/t", "/f"],
        {
          stdio: "ignore",
          timeout: 15_000,
        },
      )
    } catch {
      // The main process has already exited; its children are listed above.
    }
  }
  launched.process().kill()
}
// A quit that never finishes would hold this script until the job's
// timeout with no output; the desktop-v0.4.0 release run waited 30 minutes
// on Windows. Fail with a reason instead, and end the process.
const quitLimit = 20_000
const closeWithin = async (launched, description) => {
  const startedAt = Date.now()
  let timer
  try {
    await Promise.race([
      launched.close(),
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(
            new Error(
              `${description} did not quit within ${quitLimit} ms.`,
            ),
          )
        }, quitLimit)
      }),
    ])
  } catch (error) {
    console.error(describeLeftovers(launched, startedAt))
    endProcessTree(launched)
    throw error
  } finally {
    clearTimeout(timer)
  }
  return Date.now() - startedAt
}
const app = await launch()

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
    "sending this computer's audio delivers VBAN packets",
    async () => {
      await waitFor(
        () => vbanPackets.length >= 200,
        "200 VBAN packets",
      ).catch((error) => {
        throw new Error(
          `${error.message} ${vbanPackets.length} arrived. App log:\n${logLines.join("").trim()}`,
        )
      })
      const packets = vbanPackets.slice(0, 200)
      packets.forEach((packet) => {
        assert.equal(
          packet.subarray(0, 4).toString(),
          "VBAN",
        )
        // Audio, 48 kHz; 256 frames; 2 channels; INT16 PCM.
        assert.deepEqual(
          [...packet.subarray(4, 8)],
          [3, 255, 1, 1],
        )
        assert.equal(
          packet
            .subarray(8, 24)
            .toString()
            .replace(/\0+$/, ""),
          "Smoke",
        )
        assert.equal(packet.length, 28 + 1024)
      })
      const counters = packets.map((packet) =>
        packet.readUInt32LE(24),
      )
      counters.slice(1).forEach((counter, index) => {
        assert.equal(counter, (counters[index] ?? 0) + 1)
      })
      // The fake device beeps: some of what arrived is not silence.
      assert.ok(
        vbanPackets.some((packet) =>
          packet.subarray(28).some((byte) => byte !== 0),
        ),
        "every packet was silent",
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
      // Identify the new partition: a rebased window can have the same URL
      // before the newly added window has finished attaching its sign-in.
      await waitFor(
        () =>
          app.evaluate(
            ({ BrowserWindow }, { partition, url }) =>
              BrowserWindow.getAllWindows().some(
                (window) =>
                  window.webContents.session.storagePath?.includes(
                    partition,
                  ) && window.webContents.getURL() === url,
              ),
            {
              partition: `castkit-window-${thirdId}`,
              url: `${otherOrigin}/screen/other`,
            },
          ),
        "the new window loaded on the new server",
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
  await closeWithin(app, "The first app")
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

try {
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
    await closeWithin(restarted, "The restarted app")
  }

  // The saved state still sends audio, so each launch starts the capture,
  // and a quit lands while that capture is starting or running.
  await check(
    "quitting while it sends audio ends the app every time",
    async () => {
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        const launched = await launch()
        if (attempt % 2 === 0) {
          await launched.firstWindow()
        }
        const duration = await closeWithin(
          launched,
          `Launch ${attempt}`,
        )
        console.info(
          `  launch ${attempt} quit in ${duration} ms`,
        )
      }
      const forcedQuits =
        logLines.join("").split("so CastKit ends now")
          .length - 1
      console.info(
        `  quits ended by the 5-second limit: ${forcedQuits}`,
      )
    },
  )
} finally {
  server.close()
  vbanListener.close()
  // A process that was ended by force can hold its profile for a moment.
  rmSync(stateDirectory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 500,
  })
}
console.info(`\n${results.length} checks passed.`)
console.info(logLines.join("").trim())
