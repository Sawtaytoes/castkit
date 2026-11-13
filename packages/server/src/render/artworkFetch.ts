/**
 * Fetches now-playing artwork (album art / Plex poster) from a plain URL and
 * returns it as a data URI the render engines can embed directly. The URL comes
 * from Home Assistant in the pushed now-playing payload — Inkcast just fetches
 * it, it does not know or care that HA produced it. Results are cached by URL:
 * HA hands back a fresh URL (a rotated proxy token, a new poster) whenever the
 * artwork changes, so the URL itself is a perfect cache key.
 *
 * All image sizing/dithering to the panel happens downstream in the render
 * pipeline — this only turns a URL into bytes.
 */

const MAX_CACHE_ENTRIES = 16

/**
 * A fetch that never answers held the now-playing update behind it forever,
 * because `fetch` has no default timeout. Ten seconds matches the browser-mode
 * artwork route.
 */
export const ARTWORK_FETCH_TIMEOUT_MILLISECONDS = 10_000

/**
 * The largest artwork body this reads. Album art and posters are well under a
 * megabyte; the data URI is held in memory, cached sixteen deep, and embedded
 * into every render, so an unbounded body could exhaust the server.
 */
export const ARTWORK_MAX_BYTES = 8 * 1024 * 1024

const cache = new Map<string, string>()

/** Reads the body in chunks and stops as soon as it passes the byte limit. */
const readBodyWithinLimit = async ({
  response,
  maxBytes,
}: {
  response: Response
  maxBytes: number
}) => {
  if (
    Number(response.headers.get("content-length")) >
    maxBytes
  ) {
    await response.body?.cancel()
    return undefined
  }
  if (!response.body) {
    return Buffer.alloc(0)
  }
  const reader = response.body.getReader()
  const readChunks = async ({
    chunks,
    byteCount,
  }: {
    chunks: readonly Uint8Array[]
    byteCount: number
  }): Promise<Buffer | undefined> => {
    const chunk = await reader.read()
    if (chunk.done) {
      return Buffer.concat(chunks, byteCount)
    }
    const nextByteCount = byteCount + chunk.value.byteLength
    if (nextByteCount > maxBytes) {
      await reader.cancel()
      return undefined
    }
    return readChunks({
      chunks: chunks.concat(chunk.value),
      byteCount: nextByteCount,
    })
  }
  return readChunks({ chunks: [], byteCount: 0 })
}

export const fetchArtworkDataUri = async ({
  url,
  fetchImage = fetch,
}: {
  url: string
  fetchImage?: typeof fetch
}): Promise<string | undefined> => {
  const cached = cache.get(url)
  if (cached) {
    return cached
  }

  try {
    const response = await fetchImage(url, {
      signal: AbortSignal.timeout(
        ARTWORK_FETCH_TIMEOUT_MILLISECONDS,
      ),
    })
    if (!response.ok) {
      await response.body?.cancel()
      console.error(
        `[inkcast] artwork fetch failed (${response.status}) for ${url}`,
      )
      return undefined
    }

    const contentType =
      response.headers.get("content-type") ?? "image/jpeg"
    const imageBytes = await readBodyWithinLimit({
      response,
      maxBytes: ARTWORK_MAX_BYTES,
    })
    if (!imageBytes) {
      console.error(
        `[inkcast] artwork larger than ${ARTWORK_MAX_BYTES} bytes skipped for ${url}`,
      )
      return undefined
    }
    const dataUri = `data:${contentType};base64,${imageBytes.toString("base64")}`

    // Bounded cache: evict the oldest entry once full.
    if (cache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = cache.keys().next().value
      if (oldestKey !== undefined) {
        cache.delete(oldestKey)
      }
    }
    cache.set(url, dataUri)

    return dataUri
  } catch (error) {
    console.error(
      `[inkcast] artwork fetch errored for ${url}`,
      error,
    )
    return undefined
  }
}

/**
 * Keeps only the newest request per key. Now-playing payloads for one display
 * can arrive faster than their artwork downloads finish, and the downloads can
 * finish out of order. Without this, a slow download for the previous track
 * lands after the new track's payload and paints the old cover over it.
 *
 * Call `begin` before the slow work and check `getIsLatest` after it; a newer
 * `begin` for the same key makes every older one stale.
 */
export const createLatestRequestTracker = () => {
  const latestRequestByKey = new Map<string, symbol>()
  return {
    begin: (key: string) => {
      const request = Symbol(key)
      latestRequestByKey.set(key, request)
      return {
        getIsLatest: () =>
          latestRequestByKey.get(key) === request,
      }
    },
  }
}
