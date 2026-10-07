import { createReadStream } from "node:fs"
import { mkdir, stat } from "node:fs/promises"
import { createServer } from "node:http"
import { extname, resolve, sep } from "node:path"
import { chromium } from "@playwright/test"

// This comparison rasterizes six full-size photos after network idle. Wait for
// that work explicitly; a root timeout must never substitute a viewport crop.
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
  await page.goto(
    `http://127.0.0.1:${server.address().port}/iframe.html?id=dither-comparison--every-sample-photo&viewMode=story`,
  )
  await page.waitForLoadState("networkidle")
  await page.evaluate(() => document.fonts.ready)
  await page.waitForFunction(
    () => {
      const previews = Array.from(
        document.querySelectorAll("[data-dither-preview]"),
      )
      return (
        previews.length === 6 &&
        previews.every(
          (preview) =>
            preview.getAttribute("aria-busy") === "false",
        )
      )
    },
    undefined,
    { timeout: 120000 },
  )
  await page.addStyleTag({
    content:
      "* { transition: none !important; animation: none !important; }",
  })
  const output = resolve(
    process.env.VRT_ACTUAL_DIR ?? ".vrt-actual",
    "web",
  )
  await mkdir(output, { recursive: true })
  await page.locator("#storybook-root").screenshot({
    path: `${output}/dither-comparison--every-sample-photo.png`,
    animations: "disabled",
  })
} finally {
  await browser.close()
  server.close()
}
