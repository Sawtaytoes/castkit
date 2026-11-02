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
  paginateRecipe,
  type Recipe,
  type RecipeDisplay,
  recipeSchema,
} from "@castkit/sdk/recipe"
import { z } from "zod"

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
  const save = (sessions: CookingSession[]) => {
    if (file) {
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(
        `${file}.next`,
        JSON.stringify({
          sessions,
          requests: state.requests,
        }),
        { mode: 0o600 },
      )
      renameSync(`${file}.next`, file)
    }
    state.sessions = sessions
    onChanged()
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
    return {
      ...geometry,
      recipe: session.recipe,
      page: pages[
        Math.min(session.pageIndex, pages.length - 1)
      ]!,
      pageIndex: Math.min(
        session.pageIndex,
        pages.length - 1,
      ),
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
      const firstInstruction = pages.findIndex(
        (page) =>
          page.heading.startsWith("Step ") ||
          page.heading === "Instructions missing",
      )
      const savedInstruction =
        pages[session.instructionPage]
      const instructionPage =
        savedInstruction &&
        (savedInstruction.heading.startsWith("Step ") ||
          savedInstruction.heading ===
            "Instructions missing")
          ? session.instructionPage
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
                  session.pageIndex +
                    (action === "next" ? 1 : -1),
                ),
              )
      if (pageIndex === session.pageIndex) return session
      const updated = {
        ...session,
        pageIndex,
        instructionPage:
          pages[pageIndex]?.heading.startsWith("Step ") ||
          pages[pageIndex]?.heading ===
            "Instructions missing"
            ? pageIndex
            : session.instructionPage,
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
