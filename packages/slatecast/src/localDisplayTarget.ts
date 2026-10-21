import { readDisplayTarget } from "./platform/protocol.ts"

/** A plain link to this CastKit's own view belongs in the existing display shell. */
export const readLocalDisplayTarget = (
  view:
    | { url: string; zoom?: number; isAvailable?: boolean }
    | undefined,
) => {
  if (!view || view.isAvailable === false || view.zoom)
    return null
  try {
    const url = new URL(view.url, window.location.href)
    if (
      url.origin !== window.location.origin ||
      url.search ||
      url.hash
    )
      return null
    return readDisplayTarget(url.pathname)
  } catch {
    return null
  }
}
