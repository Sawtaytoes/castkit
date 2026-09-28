import { readFile } from "node:fs/promises"
import { createServer } from "node:http"
import { join } from "node:path"
import { chromium } from "playwright"

/**
 * Renders the Printer Status story pictures from `scene.html` into
 * `assets/sample-photos/`. three.js loads from jsDelivr, pinned, so this needs
 * the network and nothing in `package.json`.
 *
 *   yarn tsx scripts/printer-fixture-images/render.ts
 */

const SCRIPT_DIRECTORY = import.meta.dirname
const OUTPUT_DIRECTORY = join(
  SCRIPT_DIRECTORY,
  "../../assets/sample-photos",
)

const PICTURES = [
  { kind: "canisters", width: 512, height: 512 },
  { kind: "stand", width: 512, height: 512 },
  { kind: "pods", width: 512, height: 512 },
  { kind: "chamber", width: 1280, height: 720 },
] as const

const server = createServer(async (_request, response) => {
  response.writeHead(200, { "content-type": "text/html" })
  response.end(
    await readFile(join(SCRIPT_DIRECTORY, "scene.html")),
  )
}).listen(0)
const address = server.address()
const port =
  typeof address === "object" && address ? address.port : 0

const browser = await chromium.launch({
  args: [
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
})

await PICTURES.reduce(
  async (previous, { kind, width, height }) => {
    await previous
    const page = await browser.newPage({
      viewport: { width, height },
    })
    await page.goto(
      `http://127.0.0.1:${port}/?kind=${kind}&w=${width}&h=${height}`,
    )
    await page.waitForFunction(
      () => document.title === "done",
    )
    const isPlate = kind !== "chamber"
    await page.locator("#c").screenshot({
      path: join(
        OUTPUT_DIRECTORY,
        isPlate
          ? `printer-plate-${kind}.png`
          : "printer-camera-chamber.jpg",
      ),
      ...(isPlate
        ? {}
        : { quality: 82, type: "jpeg" as const }),
    })
    await page.close()
  },
  Promise.resolve(),
)

await browser.close()
server.close()
