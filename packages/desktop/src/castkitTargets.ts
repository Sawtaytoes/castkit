import { z } from "zod"

const accessSchema = z
  .enum(["public", "pin"])
  .catch("public")

const viewSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  access: accessSchema.default("public"),
})

const screenSchema = viewSchema.extend({
  viewIds: z.array(z.string()).catch([]).default([]),
})

const viewsResponseSchema = z.object({
  views: z.array(viewSchema).default([]),
  screens: z.array(screenSchema).default([]),
})

/** A page the "Add window" list offers: a screen, which carries its own view tabs, or one view. */
export type CastkitPage = {
  kind: "screen" | "view"
  id: string
  name: string
  path: string
  isPinProtected: boolean
  /** A screen's views, in its tab order. Empty for a view. */
  viewIds: string[]
}

/**
 * Turn the server's `GET /api/views` answer into pages, screens first, each
 * with the path a window loads. A server too old to send `viewIds` still
 * lists its screens; their views simply are not grouped under them.
 */
export const parseCastkitPages = (
  raw: unknown,
): CastkitPage[] => {
  const parsed = viewsResponseSchema.safeParse(raw)
  if (!parsed.success) {
    return []
  }
  return [
    ...parsed.data.screens.map(
      ({ id, name, access, viewIds }): CastkitPage => ({
        kind: "screen",
        id,
        name: name || id,
        path: `/screen/${encodeURIComponent(id)}`,
        isPinProtected: access === "pin",
        viewIds,
      }),
    ),
    ...parsed.data.views.map(
      ({ id, name, access }): CastkitPage => ({
        kind: "view",
        id,
        name: name || id,
        path: `/view/${encodeURIComponent(id)}`,
        isPinProtected: access === "pin",
        viewIds: [],
      }),
    ),
  ]
}

/**
 * Ask a CastKit server which screens and views it has. A server that cannot be
 * reached answers with no pages and the reason, so the list can say why.
 */
export const fetchCastkitPages = async (
  serverOrigin: string,
): Promise<
  | { pages: CastkitPage[]; error: null }
  | { pages: []; error: string }
> => {
  try {
    const response = await fetch(
      `${serverOrigin}/api/views`,
      {
        signal: AbortSignal.timeout(5000),
      },
    )
    return response.ok
      ? {
          pages: parseCastkitPages(await response.json()),
          error: null,
        }
      : {
          pages: [],
          error: `The server answered ${response.status}.`,
        }
  } catch (error) {
    return {
      pages: [],
      error:
        error instanceof Error &&
        error.name === "TimeoutError"
          ? "The server did not answer within 5 seconds."
          : "The server could not be reached.",
    }
  }
}
