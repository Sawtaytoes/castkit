import { spawn } from "node:child_process"
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

// Memory of the BUILT server under each render engine. Starts
// `packages/server/dist/index.js` (run `pnpm build` first) with fixture panels
// at the four production image sizes, renders every view on every panel
// through the HTTP API, and samples the proportional set size (PSS) of the
// whole process tree — node plus every browser process it starts — so shared
// pages are counted once.
//
// Usage: node scripts/bakeoff/serverMemory.mjs <chromium|satori> [rounds] [panel-id]

const engine = process.argv[2] ?? "chromium"
const rounds = Number(process.argv[3] ?? 3)
const panelFilter = process.argv[4]
const port = 18790

const panels = [
  {
    id: "panel-250x122",
    width: 250,
    height: 122,
    colorMode: "monochrome",
    ditherProfile: {
      algorithm: "atkinson",
      supersampleFactor: 4,
    },
  },
  {
    id: "panel-800x480",
    width: 800,
    height: 480,
    colorMode: "spectra6",
    ditherProfile: {
      algorithm: "floyd-steinberg",
      supersampleFactor: 2,
    },
  },
  {
    id: "panel-1600x1200",
    width: 1600,
    height: 1200,
    colorMode: "spectra6",
    ditherProfile: {
      algorithm: "floyd-steinberg",
      supersampleFactor: 2,
    },
  },
  {
    id: "panel-960x540",
    width: 960,
    height: 540,
    colorMode: "grayscale",
    ditherProfile: {
      algorithm: "floyd-steinberg",
      supersampleFactor: 2,
    },
  },
]
  .filter(
    (panel) => !panelFilter || panel.id === panelFilter,
  )
  .map((panel, index) => ({
    ...panel,
    label: `Bake-off Panel ${index + 1}`,
    mac: `aa:bb:cc:00:10:0${index + 1}`,
    rotation: 0,
  }))

const workingDirectory = mkdtempSync(
  join(tmpdir(), "castkit-server-memory-"),
)
const devicesFile = join(workingDirectory, "devices.json")
writeFileSync(devicesFile, JSON.stringify(panels))

const server = spawn(
  process.execPath,
  [resolve("packages/server/dist/index.js")],
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
      NODE_OPTIONS: process.env.NODE_OPTIONS,
      INKCAST_DEVICES_FILE: devicesFile,
      CASTKIT_PUBLIC_URL: `http://127.0.0.1:${port}`,
    },
    stdio: ["ignore", "ignore", "inherit"],
  },
)

const readChildren = () => {
  const childrenByParent = new Map()
  for (const entry of readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) continue
    try {
      const parentId = readFileSync(
        `/proc/${entry}/stat`,
        "utf8",
      )
        .split(") ")[1]
        .split(" ")[1]
      const siblings = childrenByParent.get(parentId) ?? []
      siblings.push(entry)
      childrenByParent.set(parentId, siblings)
    } catch {}
  }
  return childrenByParent
}

const readTreeProportionalMebibytes = () => {
  const childrenByParent = readChildren()
  const pending = [String(server.pid)]
  let kibibytes = 0
  let processCount = 0
  while (pending.length) {
    const processId = pending.pop()
    try {
      const rollup = readFileSync(
        `/proc/${processId}/smaps_rollup`,
        "utf8",
      )
      kibibytes += Number(/^Pss:\s+(\d+)/m.exec(rollup)[1])
      processCount += 1
    } catch {}
    pending.push(...(childrenByParent.get(processId) ?? []))
  }
  return { mebibytes: kibibytes / 1024, processCount }
}

const delay = (milliseconds) =>
  new Promise((resolveDelay) => {
    setTimeout(resolveDelay, milliseconds)
  })

const api = (path, body) =>
  fetch(`http://127.0.0.1:${port}${path}`, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  })

let viewNames = null
for (
  let attempt = 0;
  attempt < 120 && !viewNames;
  attempt++
) {
  const response = await api("/health").catch(() => null)
  if (response?.ok)
    viewNames = (await response.json()).views
  else await delay(500)
}
if (!viewNames) {
  server.kill()
  throw new Error("the server did not answer /health")
}

await delay(5000)
const idle = readTreeProportionalMebibytes()

let peakMebibytes = idle.mebibytes
let peakProcessCount = idle.processCount
const sampler = setInterval(() => {
  const sample = readTreeProportionalMebibytes()
  if (sample.mebibytes > peakMebibytes) {
    peakMebibytes = sample.mebibytes
    peakProcessCount = sample.processCount
  }
}, 200)

const renderStartedAt = Date.now()
let renderCount = 0
let failureCount = 0
for (let round = 0; round < rounds; round++) {
  for (const panel of panels) {
    for (const viewName of viewNames) {
      await api(`/api/devices/${panel.id}/view`, {
        view: viewName,
      })
      const response = await api(
        `/api/devices/${panel.id}/render`,
        {},
      )
      if (response.ok) renderCount += 1
      else failureCount += 1
    }
  }
}
const renderMilliseconds = Date.now() - renderStartedAt
clearInterval(sampler)

await delay(10_000)
const settled = readTreeProportionalMebibytes()

server.kill("SIGTERM")
await delay(1000)
rmSync(workingDirectory, { recursive: true, force: true })

console.log(
  JSON.stringify({
    engine,
    rounds,
    renderCount,
    failureCount,
    renderMilliseconds,
    idleMebibytes: Math.round(idle.mebibytes),
    idleProcessCount: idle.processCount,
    peakMebibytes: Math.round(peakMebibytes),
    peakProcessCount,
    settledMebibytes: Math.round(settled.mebibytes),
  }),
)
