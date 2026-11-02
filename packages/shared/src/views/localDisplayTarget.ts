/** Resolve an available, unzoomed saved composition on this CastKit's origin. */
export const readLocalDisplayTarget = ({
  view,
  origin,
  baseUrl = origin,
}: {
  view:
    | { url: string; zoom?: number; isAvailable?: boolean }
    | undefined
  origin: string
  baseUrl?: string
}) => {
  if (!view || view.zoom || view.isAvailable === false) {
    return null
  }
  try {
    const url = new URL(view.url, baseUrl)
    const match = /^\/(view|screen)\/([^/]+)\/?$/.exec(
      url.pathname,
    )
    if (
      url.origin !== new URL(origin).origin ||
      url.search ||
      url.hash ||
      !match
    ) {
      return null
    }
    return {
      kind: match[1] as "view" | "screen",
      id: decodeURIComponent(match[2] ?? ""),
    }
  } catch {
    return null
  }
}
