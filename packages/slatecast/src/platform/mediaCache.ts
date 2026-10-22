const images = new Map<
  string,
  { url: string; bytes: number; expiresAt: number }
>()
const access = { revision: 0 }
const MAX_BYTES = 8 * 1024 * 1024

/** Reuse authorized static images in memory even when HTTP caching is disabled. */
export const recallMediaUrl = (path: string) => {
  const image = images.get(path)
  if (!image) return path
  if (image.expiresAt <= Date.now()) {
    URL.revokeObjectURL(image.url)
    images.delete(path)
    return path
  }
  return image.url
}

/** Release private media when access changes; nothing is written to persistent storage. */
export const clearMediaCache = () => {
  access.revision += 1
  images.forEach((image) => {
    URL.revokeObjectURL(image.url)
  })
  images.clear()
}

/** Prepare a bounded static image; never cache a camera, stream, or arbitrary remote URL. */
export const warmMedia = async ({
  path,
  signal,
}: {
  path: string
  signal?: AbortSignal
}) => {
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\")
  )
    return
  const cached = images.get(path)
  if (cached && cached.expiresAt > Date.now() + 30_000)
    return
  const revision = access.revision
  const request = new AbortController()
  const cancel = () => request.abort()
  signal?.addEventListener("abort", cancel, { once: true })
  if (signal?.aborted) cancel()
  const timeout = window.setTimeout(cancel, 2500)
  try {
    const response = await fetch(path, {
      credentials: "same-origin",
      cache: "no-store",
      signal: request.signal,
    })
    if (
      !response.ok ||
      !/^image\/(jpeg|png|webp|avif|gif)\b/i.test(
        response.headers.get("content-type") ?? "",
      )
    )
      return
    const blob = await response.blob()
    if (
      request.signal.aborted ||
      revision !== access.revision ||
      blob.size > 2 * 1024 * 1024
    )
      return
    const bytes = [...images.values()].reduce(
      (total, image) => total + image.bytes,
      0,
    )
    if (images.size >= 16 || bytes + blob.size > MAX_BYTES)
      clearMediaCache()
    const url = URL.createObjectURL(blob)
    const previous = images.get(path)
    if (previous) URL.revokeObjectURL(previous.url)
    images.set(path, {
      url,
      bytes: blob.size,
      expiresAt: Date.now() + 60_000,
    })
    const image = new Image()
    image.src = url
    await image.decode()
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener("abort", cancel)
  }
}
