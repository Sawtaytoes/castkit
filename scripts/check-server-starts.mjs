import { spawn } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

// Starts the BUILT server (`packages/server/dist/index.js`, the file the
// image runs) and waits for `/health`. Every other gate runs from source, so
// on 2026-10-13 a Satori upgrade that left the bundle with two top-level
// `createRequire` bindings passed all of them and crash-looped production
// (castkit#260, fixed in #262). A bundle that cannot load fails here.
//
// Satori by default: it needs no browser download, and a load failure is
// engine-independent because node parses the whole bundle before `main`
// runs. The image check in `docker-deploy` covers the Chromium start.
//
// Usage: node scripts/check-server-starts.mjs [--engine chromium|satori]

const engineFlagIndex = process.argv.indexOf("--engine")
const engine =
  engineFlagIndex === -1
    ? "satori"
    : process.argv[engineFlagIndex + 1]

const bundlePath = resolve("packages/server/dist/index.js")
const port = 18788
const timeoutMilliseconds = 60_000

// The server writes its state under the working directory, so run it in a
// scratch one rather than leaving `data/` in the checkout.
const workingDirectory = mkdtempSync(
  join(tmpdir(), "castkit-server-start-"),
)

const server = spawn(
  process.execPath,
  ["--enable-source-maps", bundlePath],
  {
    cwd: workingDirectory,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      PLAYWRIGHT_BROWSERS_PATH:
        process.env.PLAYWRIGHT_BROWSERS_PATH,
      NODE_ENV: "production",
      PORT: String(port),
      INKCAST_RENDER_ENGINE: engine,
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
)

const outputLines = []
const recordOutput = (chunk) => {
  outputLines.push(chunk.toString())
}
server.stdout.on("data", recordOutput)
server.stderr.on("data", recordOutput)

let exitCode = null
server.on("exit", (code, signal) => {
  exitCode = code ?? signal
})

const finish = (isStarted, reason) => {
  server.kill("SIGTERM")
  rmSync(workingDirectory, {
    recursive: true,
    force: true,
  })

  if (isStarted) {
    console.log(`[check-server-starts] ${reason}`)
    process.exit(0)
  }

  console.error(`[check-server-starts] FAILED: ${reason}`)
  console.error(outputLines.join(""))
  process.exit(1)
}

const startedAt = Date.now()

while (Date.now() - startedAt < timeoutMilliseconds) {
  if (exitCode !== null) {
    finish(
      false,
      `the server exited (${exitCode}) before /health answered`,
    )
  }

  const response = await fetch(
    `http://127.0.0.1:${port}/health`,
  ).catch(() => null)

  if (response?.ok) {
    finish(
      true,
      `engine=${engine}: /health answered ${response.status} after ${Date.now() - startedAt} ms`,
    )
  }

  await new Promise((resolveDelay) => {
    setTimeout(resolveDelay, 500)
  })
}

finish(
  false,
  `/health did not answer within ${timeoutMilliseconds} ms`,
)
