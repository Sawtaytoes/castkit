import {
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto"
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs"
import { dirname } from "node:path"
import type {
  ChannelSnapshot,
  ViewDefinition,
} from "@castkit/sdk/contracts"
import {
  isInstructionPage,
  paginateRecipe,
  type Recipe,
  type RecipeDisplay,
  type RecipePage,
  recipeSchema,
} from "@castkit/sdk/recipe"
import { z } from "zod"

/**
 * Which page a position names, by heading and which page with that heading
 * it is. A page number alone moves when a change to text wrapping changes
 * the page count; the heading ("Step 2 of 4") does not.
 */
const pageAnchorSchema = z.object({
  heading: z.string().max(200),
  occurrence: z.number().int().nonnegative(),
})
type PageAnchor = z.infer<typeof pageAnchorSchema>
const anchorOf = (
  pages: RecipePage[],
  index: number,
): PageAnchor | undefined => {
  const heading = pages[index]?.heading
  if (heading === undefined) return undefined
  return {
    heading,
    occurrence: pages
      .slice(0, index)
      .filter((page) => page.heading === heading).length,
  }
}
/** The saved position in the current page sequence, found by anchor when the number moved. */
const locatePage = (
  pages: RecipePage[],
  index: number,
  anchor?: PageAnchor,
) => {
  const clamped = Math.min(index, pages.length - 1)
  if (!anchor) return clamped
  const matches = pages.flatMap((page, position) =>
    page.heading === anchor.heading ? [position] : [],
  )
  if (matches.length)
    return matches[
      Math.min(anchor.occurrence, matches.length - 1)
    ]!
  const firstOfSection = pages.findIndex(
    (page) =>
      page.heading ===
      anchor.heading.replace(/ · continued$/, ""),
  )
  return firstOfSection >= 0 ? firstOfSection : clamped
}
const sessionSchema = z.object({
  id: z.string().uuid(),
  key: z.string().length(64),
  sourceId: z.string(),
  deviceId: z.string(),
  recipe: recipeSchema,
  width: z.number().min(320).max(7680),
  height: z.number().min(240).max(7680),
  pageIndex: z.number().int().nonnegative(),
  instructionPage: z.number().int().nonnegative(),
  pageAnchor: pageAnchorSchema.optional(),
  instructionAnchor: pageAnchorSchema.optional(),
  revision: z.number().int().nonnegative(),
  createdAt: z.string(),
})
export type CookingSession = z.infer<typeof sessionSchema>
/** A recipe stays selected until explicitly ended, including across process restarts. */
export const createCookingSessions = ({
  file,
  onChanged,
}: {
  file?: string
  onChanged: () => void
}) => {
  const loaded =
    file && existsSync(file)
      ? JSON.parse(readFileSync(file, "utf8"))
      : { sessions: [], requests: [] }
  const saved = z
    .object({
      sessions: z.array(sessionSchema).max(100),
      requests: z
        .array(
          z.object({
            id: z.string().max(100),
            seenAt: z.number(),
          }),
        )
        .max(1000),
    })
    .parse(
      Array.isArray(loaded)
        ? { sessions: loaded, requests: [] }
        : loaded,
    )
  const state = {
    sessions: saved.sessions,
    requests: saved.requests,
  }
  const write = (sessions: CookingSession[]) => {
    if (file) {
      mkdirSync(dirname(file), { recursive: true })
      // A unique temporary name, so two processes cannot rename each other's file.
      const next = `${file}.${process.pid}.${randomUUID()}.next`
      writeFileSync(
        next,
        JSON.stringify({
          sessions,
          requests: state.requests,
        }),
        { mode: 0o600 },
      )
      renameSync(next, file)
    }
    state.sessions = sessions
  }
  const save = (sessions: CookingSession[]) => {
    write(sessions)
    onChanged()
  }
  // Sessions saved before anchors existed get them from the pagination they
  // were saved under, and keep them, so a later change to wrapping cannot
  // move them to another step.
  // A cursor past the last page gets no anchor and keeps the earlier
  // behavior exactly, including how Next and Previous normalize it.
  const withAnchors = (session: CookingSession) => {
    if (session.pageAnchor || session.instructionAnchor)
      return session
    const { pages } = paginateRecipe(
      session.recipe,
      session.width,
      session.height,
    )
    const pageAnchor =
      session.pageIndex < pages.length
        ? anchorOf(pages, session.pageIndex)
        : undefined
    const instructionAnchor = isInstructionPage(
      pages[session.instructionPage],
    )
      ? anchorOf(pages, session.instructionPage)
      : undefined
    return pageAnchor || instructionAnchor
      ? { ...session, pageAnchor, instructionAnchor }
      : session
  }
  const upgraded = state.sessions.map(withAnchors)
  if (
    upgraded.some(
      (session, index) => session !== state.sessions[index],
    )
  ) {
    try {
      write(upgraded)
    } catch (error) {
      // Keep serving the saved sessions; the anchors stay in memory until a save succeeds.
      state.sessions = upgraded
      console.warn(
        "Cooking sessions could not save their page anchors; a later change to recipe wrapping could move these sessions.",
        error,
      )
    }
  }
  const get = (id: string) =>
    state.sessions.find((session) => session.id === id)
  const targetId = (session: CookingSession) =>
    `cooking-${session.id}-${session.revision}`
  const display = (
    session: CookingSession,
  ): RecipeDisplay => {
    const { pages, ...geometry } = paginateRecipe(
      session.recipe,
      session.width,
      session.height,
    )
    const pageIndex = locatePage(
      pages,
      session.pageIndex,
      session.pageAnchor,
    )
    return {
      ...geometry,
      recipe: session.recipe,
      page: pages[pageIndex]!,
      pageIndex,
      pageCount: pages.length,
    }
  }
  const fromTarget = (id: string) =>
    state.sessions.find(
      (session) => targetId(session) === id,
    )
  const channelId = (session: CookingSession) =>
    `cooking/${session.id}`
  return {
    list: () => state.sessions,
    rememberRequest: (id: string) => {
      const now = Date.now()
      const current = state.requests.filter(
        (request) => now - request.seenAt < 86400000,
      )
      if (current.some((request) => request.id === id))
        return false
      const previous = state.requests
      state.requests = [
        ...current.slice(-999),
        { id, seenAt: now },
      ]
      try {
        save(state.sessions)
      } catch (error) {
        state.requests = previous
        throw error
      }
      return true
    },
    get,
    targetId,
    display,
    getForDevice: (deviceId: string) =>
      state.sessions.find(
        (session) => session.deviceId === deviceId,
      ),
    authorize: (id: string, key = "") => {
      const session = get(id)
      return Boolean(
        session &&
          /^[a-f0-9]{64}$/.test(key) &&
          timingSafeEqual(
            Buffer.from(key),
            Buffer.from(session.key),
          ),
      )
    },
    start: ({
      sourceId,
      deviceId,
      recipe,
      width,
      height,
    }: {
      sourceId: string
      deviceId: string
      recipe: Recipe
      width: number
      height: number
    }) => {
      recipeSchema.parse(recipe)
      if (JSON.stringify(recipe).length > 1000000)
        throw new Error("The recipe is too large.")
      paginateRecipe(recipe, width, height)
      const existing = state.sessions.find(
        (session) => session.deviceId === deviceId,
      )
      if (
        existing?.sourceId === sourceId &&
        existing.recipe.slug === recipe.slug
      )
        return existing
      if (existing)
        throw new Error(
          "This display already has a cooking session. Finish it before starting another recipe.",
        )
      if (state.sessions.length >= 100)
        throw new Error("Too many active cooking sessions.")
      const session = sessionSchema.parse({
        id: randomUUID(),
        key: randomBytes(32).toString("hex"),
        sourceId,
        deviceId,
        recipe,
        width,
        height,
        pageIndex: 0,
        pageAnchor: anchorOf(
          paginateRecipe(recipe, width, height).pages,
          0,
        ),
        instructionPage: 0,
        revision: 0,
        createdAt: new Date().toISOString(),
      })
      save([...state.sessions, session])
      return session
    },
    command: (
      id: string,
      action:
        | "next"
        | "previous"
        | "ingredients"
        | "instructions"
        | "done",
    ) => {
      const session = get(id)
      if (!session)
        throw new Error("This cooking session has ended.")
      if (action === "done") {
        save(
          state.sessions.filter((item) => item.id !== id),
        )
        return null
      }
      const { pages } = paginateRecipe(
        session.recipe,
        session.width,
        session.height,
      )
      const firstInstruction = Math.max(
        0,
        pages.findIndex(isInstructionPage),
      )
      // Without an anchor, use the saved numbers as-is, as before anchors existed.
      const current = session.pageAnchor
        ? locatePage(
            pages,
            session.pageIndex,
            session.pageAnchor,
          )
        : session.pageIndex
      const savedInstruction = session.instructionAnchor
        ? locatePage(
            pages,
            session.instructionPage,
            session.instructionAnchor,
          )
        : session.instructionPage
      const instructionPage = isInstructionPage(
        pages[savedInstruction],
      )
        ? savedInstruction
        : firstInstruction
      const pageIndex =
        action === "ingredients"
          ? 0
          : action === "instructions"
            ? instructionPage
            : Math.max(
                0,
                Math.min(
                  pages.length - 1,
                  current + (action === "next" ? 1 : -1),
                ),
              )
      if (
        pageIndex === current &&
        pageIndex === session.pageIndex
      )
        return session
      const isInstruction = isInstructionPage(
        pages[pageIndex],
      )
      const updated = {
        ...session,
        pageIndex,
        pageAnchor: anchorOf(pages, pageIndex),
        instructionPage: isInstruction
          ? pageIndex
          : savedInstruction,
        instructionAnchor: isInstruction
          ? anchorOf(pages, pageIndex)
          : session.instructionAnchor,
        revision: session.revision + 1,
      }
      save(
        state.sessions.map((item) =>
          item.id === id ? updated : item,
        ),
      )
      return updated
    },
    view: (
      id: string,
    ): {
      view: ViewDefinition
      screen: undefined
    } | null => {
      const session = fromTarget(id)
      return session
        ? {
            screen: undefined,
            view: {
              id,
              name: session.recipe.name,
              layout: "single",
              theme: "light",
              access: "pin",
              isControlEnabled: false,
              panels: [
                {
                  id: "recipe",
                  specId: "recipe",
                  settings: {},
                  bindings: { data: channelId(session) },
                },
              ],
            },
          }
        : null
    },
    channel: (id: string): ChannelSnapshot | undefined => {
      const session = state.sessions.find(
        (item) => channelId(item) === id,
      )
      return session
        ? {
            id,
            type: "recipe.v1",
            status: "ready",
            data: display(session),
          }
        : undefined
    },
  }
}
