import type { RenderEngine } from "@castkit/render/engine"

type BrowserEngine = RenderEngine & {
  close: () => Promise<void>
}

type RenderUrlRequest = Parameters<
  NonNullable<RenderEngine["renderUrl"]>
>[0]

/**
 * A Chromium that exists only while pages are being captured. With the Satori
 * engine drawing the image views, the browser is needed for one thing: capturing
 * a platform page (`renderPage`) for a small display such as a Watchy. So it is
 * launched on the first capture and closed once no capture has run for
 * `idleCloseMilliseconds`, which gives its memory back between bursts.
 *
 * Concurrent captures share one launch, and the idle timer only starts when the
 * last in-flight capture finishes, so a slow capture is never closed under.
 */
export const createIdleClosingBrowser = ({
  launch,
  idleCloseMilliseconds,
}: {
  launch: () => Promise<BrowserEngine>
  idleCloseMilliseconds: number
}) => {
  let enginePromise: Promise<BrowserEngine> | null = null
  let inFlightCount = 0
  let idleTimer: ReturnType<typeof setTimeout> | null = null

  const clearIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = null
  }

  const closeEngine = async () => {
    clearIdleTimer()
    const closingPromise = enginePromise
    enginePromise = null
    if (!closingPromise) return
    const engine = await closingPromise.catch(() => null)
    await engine?.close()
  }

  const scheduleIdleClose = () => {
    clearIdleTimer()
    idleTimer = setTimeout(() => {
      if (inFlightCount === 0) void closeEngine()
    }, idleCloseMilliseconds)
    // A pending close must not keep the process alive on shutdown.
    idleTimer.unref?.()
  }

  const renderUrl = async (request: RenderUrlRequest) => {
    clearIdleTimer()
    inFlightCount += 1
    try {
      if (!enginePromise) {
        enginePromise = launch()
        // A failed launch must not stick: the next capture tries again.
        enginePromise.catch(() => {
          enginePromise = null
        })
      }
      const engine = await enginePromise
      if (!engine.renderUrl)
        throw new Error(
          "the browser engine cannot capture pages",
        )
      return await engine.renderUrl(request)
    } finally {
      inFlightCount -= 1
      if (inFlightCount === 0) scheduleIdleClose()
    }
  }

  return {
    renderUrl,
    getIsOpen: () => enginePromise !== null,
    close: closeEngine,
  }
}
