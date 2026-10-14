/**
 * Render-engine bake-off over EVERY server-rendered view: each view in
 * `VIEW_NAMES` on each image panel size, through one engine per process, so
 * the process tree's peak memory belongs to that engine alone. Writes one PNG
 * per (panel, view) and `results.json` with timings to
 * `render-output/satori-bakeoff/<engine>/`. Compare with `bakeoff:views:compare`.
 *
 * Usage: pnpm bakeoff:views <chromium|satori> [output name]
 */
import {
  mkdir,
  readdir,
  readFile,
  writeFile,
} from "node:fs/promises"
import { join } from "node:path"
import { createChromiumEngine } from "@castkit/render/chromiumEngine"
import { createSatoriEngine } from "@castkit/render/satoriEngine"
import { VIEW_NAMES } from "@castkit/shared/views/viewNames"
import { buildStoryView } from "../../packages/web/src/storybook/storyViewCatalog.tsx"

const engineName = process.argv[2] ?? "chromium"
const outputName = process.argv[3] ?? engineName
const OUT = join(
  process.cwd(),
  "render-output",
  "satori-bakeoff",
  outputName,
)
const PANELS = [
  {
    key: "phat-250x122-mono",
    width: 250,
    height: 122,
    colorMode: "monochrome",
    supersample: 4,
  },
  {
    key: "impression-800x480-spectra6",
    width: 800,
    height: 480,
    colorMode: "spectra6",
    supersample: 2,
  },
  {
    key: "impression-1600x1200-spectra6",
    width: 1600,
    height: 1200,
    colorMode: "spectra6",
    supersample: 2,
  },
  {
    key: "m5paper-960x540-gray",
    width: 960,
    height: 540,
    colorMode: "grayscale",
    supersample: 2,
  },
] as const

// Peak resident memory of this process and every descendant (Chromium's children too).
const descendants = async (
  pid: number,
): Promise<number[]> => {
  const tasks = await readdir(`/proc/${pid}/task`).catch(
    () => [],
  )
  const children = (
    await Promise.all(
      tasks.map((task) =>
        readFile(
          `/proc/${pid}/task/${task}/children`,
          "utf8",
        ).catch(() => ""),
      ),
    )
  )
    .join(" ")
    .split(/\s+/)
    .filter(Boolean)
    .map(Number)
  return [
    pid,
    ...(
      await Promise.all(children.map(descendants))
    ).flat(),
  ]
}
const treeRssMib = async () => {
  const pids = await descendants(process.pid)
  const kib = await Promise.all(
    pids.map(async (pid) => {
      const status = await readFile(
        `/proc/${pid}/status`,
        "utf8",
      ).catch(() => "")
      return Number(/VmRSS:\s+(\d+)/.exec(status)?.[1] ?? 0)
    }),
  )
  return kib.reduce((sum, value) => sum + value, 0) / 1024
}

const photo = async (name: string) =>
  `data:image/jpeg;base64,${(await readFile(join("assets/sample-photos", name))).toString("base64")}`

const run = async () => {
  await mkdir(OUT, { recursive: true })
  let peakMib = await treeRssMib()
  const sampler = setInterval(async () => {
    peakMib = Math.max(peakMib, await treeRssMib())
  }, 100)
  const landscape = await photo("landscape-color.jpg")
  const portrait = await photo("portrait-face.jpg")
  const startMs = performance.now()
  // The production engines, so this measures what the server would run.
  const engine =
    engineName === "satori"
      ? await createSatoriEngine()
      : await createChromiumEngine()
  const results: Record<string, unknown>[] = []
  for (const panel of PANELS) {
    for (const viewName of VIEW_NAMES) {
      const photoUrl =
        viewName === "Photo Frame (Agenda)" ||
        panel.width < panel.height
          ? portrait
          : landscape
      const element = buildStoryView({
        viewName,
        width: panel.width,
        height: panel.height,
        colorMode: panel.colorMode,
        photoUrl,
      })
      const timings: number[] = []
      let error: string | undefined
      let png: Buffer | undefined
      for (
        let attempt = 0;
        attempt < 4 && !error;
        attempt++
      ) {
        const before = performance.now()
        try {
          png = await engine.render({
            element,
            width: panel.width,
            height: panel.height,
            supersampleFactor: panel.supersample,
          })
        } catch (caught) {
          error = String(
            (caught as Error).message ?? caught,
          ).slice(0, 300)
        }
        timings.push(performance.now() - before)
      }
      const file = `${panel.key}--${viewName.replace(/[^A-Za-z]+/g, "-").replace(/-$/, "")}.png`
      if (png) await writeFile(join(OUT, file), png)
      const warm = timings.slice(1).sort((a, b) => a - b)
      results.push({
        panel: panel.key,
        viewName,
        file,
        error,
        firstMs: Math.round(timings[0] ?? 0),
        warmMedianMs: warm.length
          ? Math.round(warm[Math.floor(warm.length / 2)])
          : undefined,
      })
      console.log(
        `[${engineName}] ${panel.key} ${viewName} ${error ? `ERROR ${error}` : `${Math.round(warm[1] ?? 0)} ms`}`,
      )
    }
  }
  const totalMs = performance.now() - startMs
  clearInterval(sampler)
  peakMib = Math.max(peakMib, await treeRssMib())
  await (
    engine as { close?: () => Promise<void> }
  ).close?.()
  await writeFile(
    join(OUT, "results.json"),
    JSON.stringify(
      {
        engineName: outputName,
        totalMs: Math.round(totalMs),
        peakTreeRssMib: Math.round(peakMib),
        results,
      },
      null,
      2,
    ),
  )
  console.log(
    `[${engineName}] total ${Math.round(totalMs)} ms, peak tree RSS ${Math.round(peakMib)} MiB`,
  )
}
await run()
