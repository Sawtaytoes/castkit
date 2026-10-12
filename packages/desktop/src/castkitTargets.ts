import { z } from "zod"

const namedTargetSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
})

const viewsResponseSchema = z.object({
  views: z.array(namedTargetSchema).default([]),
  screens: z.array(namedTargetSchema).default([]),
})

/** A page the "Add window" picker offers. */
export type CastkitTarget = {
  label: string
  path: string
}

/**
 * Turn the server's `GET /api/views` answer into picker entries: every screen
 * first (a screen carries its own view tabs), then every single view.
 */
export const parseCastkitTargets = (
  raw: unknown,
): CastkitTarget[] => {
  const parsed = viewsResponseSchema.safeParse(raw)
  if (!parsed.success) {
    return []
  }
  return [
    ...parsed.data.screens.map(({ id, name }) => ({
      label: `Screen: ${name || id}`,
      path: `/screen/${encodeURIComponent(id)}`,
    })),
    ...parsed.data.views.map(({ id, name }) => ({
      label: `View: ${name || id}`,
      path: `/view/${encodeURIComponent(id)}`,
    })),
  ]
}

/**
 * Ask a CastKit server which screens and views it has. A server that cannot be
 * reached answers with an empty list; the person can still type a path.
 */
export const fetchCastkitTargets = async (
  serverOrigin: string,
) => {
  try {
    const response = await fetch(
      `${serverOrigin}/api/views`,
      {
        signal: AbortSignal.timeout(5000),
      },
    )
    return response.ok
      ? parseCastkitTargets(await response.json())
      : []
  } catch {
    return []
  }
}
