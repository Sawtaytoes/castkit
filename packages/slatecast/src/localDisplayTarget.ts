import { readLocalDisplayTarget as readSharedLocalDisplayTarget } from "@castkit/shared/views/localDisplayTarget"

/** A plain link to this CastKit's own view belongs in the existing display shell. */
export const readLocalDisplayTarget = (
  view:
    | { url: string; zoom?: number; isAvailable?: boolean }
    | undefined,
) =>
  readSharedLocalDisplayTarget({
    view,
    origin: window.location.origin,
    baseUrl: window.location.href,
  })
