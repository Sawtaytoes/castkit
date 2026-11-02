/** Display routing belongs to CastKit and never to an upstream media provider. */
export const DISPLAY_MEDIA_CONTEXT_KEYS = [
  "device",
  "preview",
  "capture",
  "preload",
]

/** Carry the authenticated request's installation context on a same-origin media URL. */
export const withDisplayMediaContext = ({
  url,
  requestUrl,
}: {
  url: string
  requestUrl: string
}) => {
  const request = new URL(requestUrl)
  const device = request.searchParams.get("device")
  if (!device) {
    return url
  }
  const target = new URL(url, request)
  if (target.origin !== request.origin) {
    return url
  }
  DISPLAY_MEDIA_CONTEXT_KEYS.forEach((key) => {
    target.searchParams.delete(key)
  })
  target.searchParams.set("device", device)
  DISPLAY_MEDIA_CONTEXT_KEYS.filter(
    (key) => key !== "device",
  ).forEach((key) => {
    const value = request.searchParams.get(key)
    if (value && (key === "capture" || value === "1")) {
      target.searchParams.set(key, value)
    }
  })
  return `${target.pathname}${target.search}${target.hash}`
}

/** HLS query-only children replace the parent query, so scope every child and URI attribute in this channel's proxy. */
export const scopeDisplayMediaPlaylist = ({
  playlist,
  requestUrl,
}: {
  playlist: string
  requestUrl: string
}) => {
  const request = new URL(requestUrl)
  if (!request.searchParams.get("device")) {
    return playlist
  }
  const prefix = request.pathname.slice(
    0,
    request.pathname.lastIndexOf("/") + 1,
  )
  const rewrite = (uri: string) => {
    const target = new URL(uri, request)
    if (
      target.origin !== request.origin ||
      !target.pathname.startsWith(prefix)
    ) {
      return uri
    }
    return withDisplayMediaContext({ url: uri, requestUrl })
  }
  return playlist
    .split("\n")
    .map((line) =>
      line.startsWith("#")
        ? line.replace(
            /URI="([^"]+)"/g,
            (_match, uri: string) =>
              `URI="${rewrite(uri)}"`,
          )
        : line.trim()
          ? rewrite(line.trim())
          : line,
    )
    .join("\n")
}
