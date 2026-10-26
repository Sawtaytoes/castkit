import { type Browser, chromium } from "playwright"
import { renderToStaticMarkup } from "react-dom/server"
import type {
  RenderEngine,
  RenderRequest,
} from "./engine.ts"
import { FONT_FAMILY, loadFontBytes } from "./fonts.ts"

/**
 * The headless-Chromium render engine (the handoff's recommended default). It
 * SSRs the view to static HTML, loads it in a real browser at the native CSS
 * size with `deviceScaleFactor = supersampleFactor`, and screenshots it — so
 * the supersampled PNG comes out at `width × supersampleFactor`.
 *
 * Because it is a real browser, the Vite dev-preview renders the identical
 * engine: what you see in the editor is what the device gets (pre-dither).
 * The trade-off is weight (bundled Chromium) and per-render latency.
 */

/**
 * Wrap SSR'd view markup in a minimal, zero-margin full-bleed document. The
 * panel font is embedded as base64 `@font-face` so rendering is identical
 * everywhere — dev machine, CI, and the fontless container image.
 */
const buildHtmlDocument = ({
  width,
  height,
  bodyMarkup,
  fontFaceCss,
}: {
  width: number
  height: number
  bodyMarkup: string
  fontFaceCss: string
}) => `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  ${fontFaceCss}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${width}px; height: ${height}px; }
  body { overflow: hidden; }
</style>
</head>
<body>${bodyMarkup}</body>
</html>`

const buildFontFaceCss = async () => {
  const { regularData, boldData } = await loadFontBytes()
  const toFontFace = ({
    data,
    weight,
  }: {
    data: Buffer
    weight: number
  }) => `@font-face {
    font-family: "${FONT_FAMILY}";
    font-weight: ${weight};
    src: url(data:font/ttf;base64,${data.toString("base64")}) format("truetype");
  }`

  return [
    toFontFace({ data: regularData, weight: 400 }),
    toFontFace({ data: boldData, weight: 700 }),
  ].join("\n")
}

/**
 * Create a Chromium engine backed by one long-lived browser process. Call
 * `close()` when the batch is done. Reusing the browser across renders keeps
 * the expensive launch cost off the per-render path.
 */
/**
 * Resolves once the DOM has not changed for 250 ms, or after 3 s. A string,
 * not a function: a dev build (tsx) wraps named functions in a `__name`
 * helper that does not exist inside the page.
 */
const QUIET_DOM_SCRIPT = `new Promise((resolve) => {
  const quiet = { timer: 0 }
  const finish = () => {
    observer.disconnect()
    clearTimeout(limit)
    resolve()
  }
  const observer = new MutationObserver(() => {
    clearTimeout(quiet.timer)
    quiet.timer = setTimeout(finish, 250)
  })
  observer.observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  })
  quiet.timer = setTimeout(finish, 250)
  const limit = setTimeout(finish, 3000)
})`

export const createChromiumEngine = async (): Promise<
  RenderEngine & { close: () => Promise<void> }
> => {
  // Container-safe flags: Chromium refuses to run as root in Docker without
  // --no-sandbox, and /dev/shm defaults to 64MB there. The sandbox guards
  // against untrusted web content; this engine only ever loads our own SSR'd
  // markup, so dropping it is safe.
  const browser: Browser = await chromium.launch({
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  })
  const fontFaceCss = await buildFontFaceCss()

  const render = async ({
    element,
    width,
    height,
    supersampleFactor,
  }: RenderRequest) => {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: supersampleFactor,
    })

    // Always tear the context down, even if rendering throws — a leaked context
    // keeps the browser (and the Node event loop) alive and looks like a hang.
    try {
      const page = await context.newPage()

      await page.setContent(
        buildHtmlDocument({
          width,
          height,
          bodyMarkup: renderToStaticMarkup(element),
          fontFaceCss,
        }),
        { waitUntil: "load" },
      )

      // Ensure fonts are laid out before snapshotting, else text metrics/screenshot
      // can race. (Avoids `networkidle`, which Playwright warns can hang.)
      await page.evaluate(() => document.fonts.ready)

      return await page.screenshot({
        type: "png",
        clip: { x: 0, y: 0, width, height },
      })
    } finally {
      await context.close()
    }
  }

  return {
    name: "chromium",
    render,
    renderUrl: async ({
      url,
      width,
      height,
      supersampleFactor,
      headers,
    }) => {
      const origin = new URL(url).origin
      const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: supersampleFactor,
      })
      try {
        await context.route("**/*", (route) =>
          new URL(route.request().url()).origin === origin
            ? route.continue({
                headers: {
                  ...route.request().headers(),
                  ...headers,
                },
              })
            : route.abort(),
        )
        await context.routeWebSocket("**/*", (socket) => {
          socket.close()
        })
        const page = await context.newPage()
        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 15000,
        })
        await page
          .locator('[data-castkit-ready="true"]')
          .waitFor({ timeout: 10000 })
        await page.evaluate(() => document.fonts.ready)
        await page.evaluate(async () => {
          await Promise.all(
            Array.from(document.images).map((image) =>
              image.complete
                ? Promise.resolve()
                : Promise.race([
                    new Promise<void>((resolve) => {
                      image.onload = () => resolve()
                      image.onerror = () => resolve()
                    }),
                    new Promise<void>((resolve) =>
                      setTimeout(resolve, 2000),
                    ),
                  ]),
            ),
          )
        })
        return await page.screenshot({
          type: "png",
          clip: { x: 0, y: 0, width, height },
        })
      } finally {
        await context.close()
      }
    },
    captureStreamFrame: async ({
      url,
      width,
      height,
      readScript,
      readArgument,
    }) => {
      const origin = new URL(url).origin
      const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: 1,
        hasTouch: true,
        isMobile: true,
        reducedMotion: "reduce",
      })
      try {
        // The worker keeps only the top document on its origin and lets
        // every other request through; so does this page, or an image the
        // panel draws would be missing here.
        await context.route("**/*", (route) =>
          route.request().resourceType() === "document" &&
          new URL(route.request().url()).origin !== origin
            ? route.abort()
            : route.continue(),
        )
        // A capture page draws its inlined snapshot and nothing newer.
        await context.routeWebSocket("**/*", (socket) => {
          socket.close()
        })
        const page = await context.newPage()
        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 15000,
        })
        // The worker's own test for a finished view (PAGE_STATE_SCRIPT).
        await page.waitForFunction(
          () => {
            const root =
              document.querySelector<HTMLElement>(
                "[data-castkit-ready]",
              )
            return (
              Boolean(
                document.querySelector(".stage") ?? root,
              ) &&
              (!root ||
                root.dataset.castkitReady === "true") &&
              !document.querySelector(
                '.platform-loading, .platform-view[aria-busy="true"], .navigation-feedback[data-phase="loading"]',
              )
            )
          },
          undefined,
          { timeout: 10000 },
        )
        await page.evaluate(() => document.fonts.ready)
        await page.evaluate(async () => {
          await Promise.all(
            Array.from(document.images).map((image) =>
              image.complete
                ? Promise.resolve()
                : Promise.race([
                    new Promise<void>((resolve) => {
                      image.onload = () => resolve()
                      image.onerror = () => resolve()
                    }),
                    new Promise<void>((resolve) =>
                      setTimeout(resolve, 2000),
                    ),
                  ]),
            ),
          )
        })
        // Work that follows a load (an accent color read from the artwork,
        // a text fit) changes the page once more. Wait for a quiet DOM, so the
        // frame is the one the worker would settle on, not a step before it.
        await page.evaluate(QUIET_DOM_SCRIPT)
        // The same CDP call and options as the worker's Presto capture.
        const cdp = await context.newCDPSession(page)
        const shot = (await cdp.send(
          "Page.captureScreenshot",
          {
            format: "png",
            fromSurface: true,
            captureBeyondViewport: false,
            optimizeForSpeed: true,
          },
        )) as { data: string }
        const read: unknown = await page.evaluate(
          readScript,
          readArgument,
        )
        return {
          png: Buffer.from(shot.data, "base64"),
          read,
        }
      } finally {
        await context.close()
      }
    },
    close: () => browser.close(),
  }
}
