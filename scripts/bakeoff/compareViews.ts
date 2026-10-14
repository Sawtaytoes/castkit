/**
 * Pixel-compare every `bakeoff:views` output folder with `chromium/` and write
 * `render-output/satori-bakeoff/index.html` (side by side, with a diff image)
 * and `summary.json`. A pixel "differs" when any channel moves more than 48 of
 * 255, so antialiasing noise does not count but a moved line of text does.
 */
import {
  readdir,
  readFile,
  writeFile,
} from "node:fs/promises"
import { join } from "node:path"
import sharp from "sharp"

const ROOT = join(
  process.cwd(),
  "render-output",
  "satori-bakeoff",
)
const load = async (engine: string) =>
  JSON.parse(
    await readFile(
      join(ROOT, engine, "results.json"),
      "utf8",
    ),
  )

const raw = async (
  path: string,
  width: number,
  height: number,
) =>
  sharp(path)
    .resize(width, height, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer()

const compare = async (
  chromiumFile: string,
  otherFile: string,
  diffFile: string,
) => {
  const meta = await sharp(chromiumFile).metadata()
  const width = meta.width ?? 0
  const height = meta.height ?? 0
  const [a, b] = await Promise.all([
    raw(chromiumFile, width, height),
    raw(otherFile, width, height),
  ])
  const diff = Buffer.alloc(a.length)
  let changed = 0
  for (let index = 0; index < a.length; index += 3) {
    const delta = Math.max(
      Math.abs(a[index] - b[index]),
      Math.abs(a[index + 1] - b[index + 1]),
      Math.abs(a[index + 2] - b[index + 2]),
    )
    const isChanged = delta > 48
    if (isChanged) changed++
    const gray = Math.round(
      (a[index] + a[index + 1] + a[index + 2]) / 3 / 4 +
        190,
    )
    diff[index] = isChanged ? 230 : gray
    diff[index + 1] = isChanged ? 30 : gray
    diff[index + 2] = isChanged ? 30 : gray
  }
  await sharp(diff, { raw: { width, height, channels: 3 } })
    .png()
    .toFile(diffFile)
  return (
    Math.round((changed / (width * height)) * 1000) / 10
  )
}

const run = async () => {
  const chromium = await load("chromium")
  const names = (
    await readdir(ROOT, { withFileTypes: true })
  )
    .filter(
      (entry) =>
        entry.isDirectory() && entry.name !== "chromium",
    )
    .map((entry) => entry.name)
    .sort()
  const engines: Record<
    string,
    Awaited<ReturnType<typeof load>>
  > = Object.fromEntries(
    await Promise.all(
      names.map(async (name) => [name, await load(name)]),
    ),
  )
  const rows: string[] = []
  const summary: Record<string, unknown>[] = []
  for (const base of chromium.results) {
    const cells = [
      `<td><img src="chromium/${base.file}"><br>${base.warmMedianMs} ms</td>`,
    ]
    const line: Record<string, unknown> = {
      panel: base.panel,
      viewName: base.viewName,
      chromiumMs: base.warmMedianMs,
    }
    for (const [engine, data] of Object.entries(engines)) {
      const other = data.results.find(
        (entry: { panel: string; viewName: string }) =>
          entry.panel === base.panel &&
          entry.viewName === base.viewName,
      )
      if (!other || other.error || !other.file) {
        cells.push(
          `<td class="error">${other?.error ?? "missing"}</td>`,
        )
        line[`${engine}Error`] = other?.error ?? "missing"
        continue
      }
      const diffName = `diff-${engine}--${base.file}`
      const percent = await compare(
        join(ROOT, "chromium", base.file),
        join(ROOT, engine, other.file),
        join(ROOT, diffName),
      )
      cells.push(
        `<td><img src="${engine}/${other.file}"><br>${other.warmMedianMs} ms · <b>${percent}%</b> differs<br><img class="diff" src="${diffName}"></td>`,
      )
      line[`${engine}Ms`] = other.warmMedianMs
      line[`${engine}DiffPercent`] = percent
    }
    rows.push(
      `<tr><th>${base.panel}<br>${base.viewName}</th>${cells.join("")}</tr>`,
    )
    summary.push(line)
  }
  const totals = [chromium, ...Object.values(engines)]
    .map(
      (data) =>
        `<li><b>${data.engineName}</b>: ${data.totalMs} ms for all renders (4 per view), peak memory ${data.peakTreeRssMib} MiB</li>`,
    )
    .join("")
  await writeFile(
    join(ROOT, "summary.json"),
    JSON.stringify(summary, null, 2),
  )
  await writeFile(
    join(ROOT, "index.html"),
    `<!doctype html><meta charset="utf-8"><title>CastKit render engines: Chromium against Satori</title>
<style>body{font:14px system-ui;background:#111;color:#eee;margin:16px}td,th{vertical-align:top;padding:6px;border-bottom:1px solid #333;text-align:left}img{max-width:360px;background:#fff}img.diff{max-width:180px;margin-top:4px}.error{color:#f88;max-width:300px}</style>
<h1>CastKit render engines: Chromium against Satori</h1><p>Red in the small image = pixels that differ from Chromium by more than 48 of 255.</p><ul>${totals}</ul>
<table><tr><th>Panel · view</th><th>chromium</th>${names.map((name) => `<th>${name}</th>`).join("")}</tr>${rows.join("")}</table>`,
  )
  console.table(summary)
}
await run()
