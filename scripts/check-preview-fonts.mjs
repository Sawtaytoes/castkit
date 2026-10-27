import assert from "node:assert/strict"
import {
  readFile,
  unlink,
  writeFile,
} from "node:fs/promises"
import { createRequire } from "node:module"
import { fileURLToPath, pathToFileURL } from "node:url"
import { createViewportProjects } from "@charcuterie/playwright-config"
import { chromium } from "@playwright/test"

const webRoot = fileURLToPath(
  new URL("../packages/web/", import.meta.url),
)
const requireWeb = createRequire(
  new URL("../packages/web/package.json", import.meta.url),
)
const { createServer } = await import(
  pathToFileURL(requireWeb.resolve("vite")).href
)
const fileName = `.font-check-${process.pid}.html`
const fixture = `${webRoot}${fileName}`
const photoDataUri = `data:image/jpeg;base64,${(await readFile(new URL("../assets/sample-photos/landscape-color.jpg", import.meta.url))).toString("base64")}`
const html = String.raw`<html><body><div id="root"></div><script>
window.firstPublished = undefined;
const kind = new URLSearchParams(location.search).get('kind');
let paints = 0;
const draw = CanvasRenderingContext2D.prototype.drawImage;
CanvasRenderingContext2D.prototype.drawImage = function(image, ...args) {
  const result = draw.call(this, image, ...args);
  if (image instanceof HTMLImageElement && image.src.startsWith('data:image/svg+xml') && (kind === 'withheld-frame' || (kind === 'delayed-paint' && paints++ < 3))) {
    const scale = this.canvas.width / 250;
    this.fillStyle = 'white'; this.fillRect(0, 0, this.canvas.width, 90 * scale);
    if (this.canvas.height > 122 * scale) this.fillRect(0, 122 * scale, this.canvas.width, this.canvas.height - 122 * scale);
  }
  return result;
};
if (kind === 'withheld-frame') window.requestAnimationFrame = () => 1;
if (kind === 'unresolved-decode') {
  const decode = HTMLImageElement.prototype.decode;
  HTMLImageElement.prototype.decode = function() {
    return this.src.startsWith('data:image/svg+xml') ? new Promise(() => {}) : decode.call(this);
  };
}
if (kind === 'broken-face' || kind === 'broken-latin-face') {
  const serialize = XMLSerializer.prototype.serializeToString;
  XMLSerializer.prototype.serializeToString = function(node) {
    const original = serialize.call(this, node);
    const family = kind === 'broken-latin-face' ? '"Atkinson Hyperlegible"' : '"Noto Sans JP"';
    const changed = original.replace(/@font-face\s*\{[^}]*\}/g, rule => rule.includes(family) ? rule.replace(/url\([^)]*\)/g, 'url(data:font/ttf;base64,AA==)') : rule);
    if (changed !== original) window.didInvalidateFace = true;
    return changed;
  };
}
const publish = CanvasRenderingContext2D.prototype.putImageData;
CanvasRenderingContext2D.prototype.putImageData = function(image, ...args) {
  if (!window.firstPublished) {
    const ink = (left, top, width, height) => {
      let count = 0;
      for (let y = top; y < top + height; y++) for (let x = left; x < left + width; x++) {
        const i = (y * image.width + x) * 4;
        if (image.data[i + 3] > 128 && image.data[i] < 128 && image.data[i + 1] < 128 && image.data[i + 2] < 128) count++;
      }
      return count;
    };
    window.firstPublished = { width: image.width, height: image.height,
      metadata: ink(0, 0, 250, 90), footer: ink(0, 101, 250, 21) };
  }
  return publish.call(this, image, ...args);
};
</script><script type="module">
import React from 'react';
import { createRoot } from 'react-dom/client';
import { PhotoFrameView } from '/@fs${fileURLToPath(new URL("../packages/views/src/PhotoFrameView.tsx", import.meta.url))}';
import { JapaneseDithered } from '/src/stories/NowPlayingDashboard.stories.tsx';
const query = new URLSearchParams(location.search);
let view = JapaneseDithered.render();
if (query.get('kind') === 'photo-only') view = React.cloneElement(view, {}, React.createElement(PhotoFrameView, { width: 250, height: 122, colorMode: 'monochrome', photoDataUri: ${JSON.stringify(photoDataUri)} }));
if (query.get('kind') === 'controls') view = React.cloneElement(view, {}, React.cloneElement(view.props.children, { title: '日本語\u0001\ud800 ABC123 😀' }));
view = React.cloneElement(view, { supersampleFactor: Number(query.get('scale') || 4) });
createRoot(document.getElementById('root')).render(view);
</script></body></html>`

await writeFile(fixture, html)
let server
let browser
try {
  server = await createServer({
    root: webRoot,
    configFile: `${webRoot}vite.config.ts`,
    server: { host: "127.0.0.1", port: 0, open: false },
  })
  await server.listen()
  const address = server.httpServer.address()
  assert(address && typeof address === "object")
  const origin = `http://127.0.0.1:${address.port}`
  browser = await chromium.launch({ headless: true })
  const cases = [
    ...[1, 2, 3, 4].map((scale) => ({
      kind: "normal",
      scale,
    })),
    { kind: "delayed-paint", scale: 4 },
    { kind: "controls", scale: 4 },
    { kind: "photo-only", scale: 4 },
    ...[
      "broken-face",
      "broken-latin-face",
      "unresolved-decode",
      "withheld-frame",
    ].map((kind) => ({
      kind,
      scale: 4,
      isFailureExpected: true,
    })),
  ]
  for (const project of createViewportProjects()) {
    for (const sample of cases) {
      // Every case gets a cold document, resource cache and font set.
      const context = await browser.newContext({
        viewport: project.use.viewport,
        deviceScaleFactor: project.use.deviceScaleFactor,
      })
      try {
        const page = await context.newPage()
        await page.goto(
          `${origin}/${fileName}?kind=${sample.kind}&scale=${sample.scale}`,
        )
        await page.waitForSelector(
          '[data-dither-preview][aria-busy="false"]',
          { timeout: 20_000 },
        )
        const result = await page.evaluate(() => ({
          pixels: window.firstPublished,
          didInvalidateFace: window.didInvalidateFace,
          text: document.body.textContent,
          sourceText: document.querySelector(
            '[data-dither-preview] [aria-hidden="true"]',
          )?.textContent,
          hasPhoto: Boolean(
            document.querySelector(
              "[data-dither-preview] img",
            )?.naturalWidth,
          ),
        }))
        if (sample.isFailureExpected) {
          assert.match(
            result.text,
            /Dither preview failed:.*deadline/,
            `${project.name}: ${sample.kind} must fail explicitly`,
          )
          assert.equal(
            result.pixels,
            undefined,
            "A failed font render must not publish pixels",
          )
          if (sample.kind.startsWith("broken-"))
            assert.equal(
              result.didInvalidateFace,
              true,
              "The serialized SVG face must actually be invalidated",
            )
        } else {
          assert.doesNotMatch(
            result.text,
            /Dither preview failed:/,
          )
          assert(
            result.pixels?.metadata > 500,
            `${project.name}: metadata missing from first published canvas`,
          )
          assert(
            result.pixels?.footer > 100,
            `${project.name}: footer missing from first published canvas`,
          )
          if (sample.kind === "photo-only") {
            assert.equal(
              result.sourceText,
              "",
              "The populated Photo Frame source must contain no discoverable text",
            )
            assert.equal(
              result.hasPhoto,
              true,
              "The populated Photo Frame must load its photo",
            )
          }
          assert.equal(result.pixels.width, 250)
          assert.equal(
            result.pixels.height,
            122,
            "Readiness probes must not escape into the exported panel",
          )
        }
        console.log(
          `[preview-fonts] ${project.name} ${sample.kind} scale=${sample.scale}: passed`,
        )
      } finally {
        await context.close()
      }
    }
  }
} finally {
  await browser?.close()
  await server?.close()
  await unlink(fixture).catch(() => {})
}
