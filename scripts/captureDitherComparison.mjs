import { createReadStream } from "node:fs"
import { mkdir, readFile, stat } from "node:fs/promises"
import { createServer } from "node:http"
import { extname, resolve, sep } from "node:path"
import { chromium } from "@playwright/test"
import { captureDitherStory } from "./captureDitherStory.ts"

// Rasterized stories finish asynchronously after network idle. Capture them
// serially after completion; failed font/image renders must never become baselines.
const root = resolve("packages/web/storybook-static")
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
}
const server = createServer(async (request, response) => {
  const path = resolve(
    root,
    `.${new URL(request.url ?? "/", "http://localhost").pathname}`,
  )
  try {
    if (!path.startsWith(`${root}${sep}`))
      throw new Error("Invalid asset path")
    await stat(path)
    response.setHeader(
      "Content-Type",
      mime[extname(path)] ?? "application/octet-stream",
    )
    createReadStream(path).pipe(response)
  } catch {
    response.writeHead(404).end()
  }
})
await new Promise((resolve) =>
  server.listen(0, "127.0.0.1", resolve),
)
const browser = await chromium.launch()
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  })
  const output = resolve(
    process.env.VRT_ACTUAL_DIR ?? ".vrt-actual",
    "web",
  )
  await mkdir(output, { recursive: true })
  const comparisons = [
    "dither-comparison--every-sample-photo",
    "dither-comparison--impression-every-algorithm",
  ]
  const index = JSON.parse(
    await readFile(resolve(root, "index.json"), "utf8"),
  )
  const filters = (process.env.VRT_INCLUDE ?? "")
    .split(/[\s,]+/)
    .filter(Boolean)
  const storyIds = Object.values(index.entries)
    .filter((entry) => entry.type === "story")
    .map((entry) => entry.id)
    .filter(
      (storyId) =>
        storyId.endsWith("-dithered") ||
        comparisons.includes(storyId),
    )
    .filter(
      (storyId) =>
        filters.length === 0 ||
        filters.some((filter) => storyId.includes(filter)),
    )
  if (storyIds.length === 0)
    throw new Error("No dithered stories matched")
  await storyIds.reduce(async (previous, storyId) => {
    await previous
    await captureDitherStory({
      page,
      storyId,
      url: `http://127.0.0.1:${server.address().port}/iframe.html?id=${storyId}&viewMode=story`,
      outputPath: `${output}/${storyId}.png`,
      previewCount: comparisons.includes(storyId) ? 6 : 1,
    })
    console.log(`[vrt] complete dither preview ${storyId}`)
  }, Promise.resolve())
} finally {
  await browser.close()
  server.close()
}
