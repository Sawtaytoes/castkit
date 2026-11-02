import type { SourceContext } from "@castkit/sdk/plugin"
import type { Hono } from "hono"
import { z } from "zod"
import type { Platform } from "./platform.ts"
import {
  mealieRequest,
  readMealieRecipe,
} from "./sources/mealie.ts"

const startSchema = z.object({
  sourceId: z.string(),
  deviceId: z.string(),
  link: z.string().trim().min(1).max(4096),
})
const commandSchema = z.object({
  revision: z.number().int().nonnegative(),
  action: z.enum([
    "next",
    "previous",
    "ingredients",
    "instructions",
    "done",
  ]),
})
/** Source credentials stay on the server; public controls authorize only their own session. */
export const attachCookingRoutes = ({
  app,
  platform,
}: {
  app: Hono
  platform: Platform
}) => {
  const contextFor = (sourceId: string): SourceContext => {
    const source = platform.store
      .get()
      .sources.find(
        (item) =>
          item.id === sourceId &&
          item.adapter === "mealie" &&
          item.isEnabled,
      )
    if (
      !source ||
      !platform.catalog.adapters.some(
        (item) => item.id === "mealie",
      )
    )
      throw new Error(
        "Configure an enabled Mealie source first.",
      )
    if (
      platform.store
        .get()
        .disabledPluginIds.includes("castkit.source.mealie")
    )
      throw new Error("The Mealie source is disabled.")
    return {
      source,
      channels: [],
      secrets:
        platform.store.get().secrets[source.id] ?? {},
      signal: new AbortController().signal,
      fetch,
      publish: () => {},
      reportError: () => {},
    }
  }
  const present = (
    session: NonNullable<
      ReturnType<typeof platform.cooking.get>
    >,
  ) => ({
    id: session.id,
    revision: session.revision,
    deviceId: session.deviceId,
    sourceId: session.sourceId,
    display: platform.cooking.display(session),
    targetId: platform.cooking.targetId(session),
    controlPath: `/cook/${session.id}#${session.key}`,
  })
  let pending = Promise.resolve()
  const startRequest = async (input: unknown) => {
    const request = startSchema.parse(input)
    const device = /^phone-only\/[a-f0-9-]{36}$/.test(
      request.deviceId,
    )
      ? {
          width: 800,
          height: 480,
          delivery: "image" as const,
        }
      : platform.getDeviceProperties(request.deviceId)
    if (!device) throw new Error("Unknown display.")
    if (device.delivery !== "image")
      throw new Error(
        "Choose phone-only controls or an image-delivery display. Browser kiosk targets are not supported for cooking sessions yet.",
      )
    const context = contextFor(request.sourceId)
    const active = platform.cooking.getForDevice(
      request.deviceId,
    )
    if (active) {
      if (
        active.sourceId === request.sourceId &&
        [
          active.recipe.slug,
          active.recipe.url,
          active.recipe.sourceUrl,
        ].includes(request.link)
      )
        return present(active)
      throw new Error(
        "Finish the current cooking session before starting another recipe on this display.",
      )
    }
    let slug = request.link
    if (/^https?:/i.test(slug)) {
      const url = new URL(slug)
      if (url.username || url.password)
        throw new Error(
          "Recipe links cannot contain credentials.",
        )
      const base = new URL(
        String(context.source.settings.url),
      )
      if (url.origin === base.origin) {
        const match = url.pathname.match(
          /\/g\/[^/]+\/r\/([^/]+)\/?$/,
        )
        if (!match)
          throw new Error("Choose a Mealie recipe link.")
        slug = decodeURIComponent(match[1]!)
      } else {
        // Mealie owns recipe extraction and its outbound URL policy. CastKit never renders arbitrary sites.
        const saved = z
          .object({
            items: z.array(
              z.object({
                slug: z.string(),
                orgURL: z.string().nullish(),
              }),
            ),
          })
          .parse(
            await (
              await mealieRequest(
                context,
                "/api/recipes?perPage=1000",
              )
            ).json(),
          )
        const existing = saved.items.find(
          (item) => item.orgURL === url.toString(),
        )
        const imported: unknown =
          existing?.slug ??
          (await (
            await mealieRequest(
              context,
              "/api/recipes/create/url",
              { url: url.toString(), includeTags: false },
            )
          ).json())
        slug = z.string().min(1).max(500).parse(imported)
      }
    } else if (!/^[a-zA-Z0-9_-]+$/.test(slug))
      throw new Error(
        "Enter a saved recipe or an HTTP recipe link.",
      )
    const recipe = await readMealieRecipe(context, slug)
    return present(
      platform.cooking.start({
        ...request,
        recipe,
        width: device.width,
        height: device.height,
      }),
    )
  }
  const start = (input: unknown) => {
    const result = pending.then(() => startRequest(input))
    pending = result.then(
      () => {},
      () => {},
    )
    return result
  }
  app.use(
    "/api/manage/cooking/*",
    async (context, next) => {
      context.header("Cache-Control", "no-store")
      await next()
    },
  )
  app.get("/api/manage/cooking", (context) =>
    context.json({
      sessions: platform.cooking.list().map(present),
    }),
  )
  app.get(
    "/api/manage/cooking/sources/:id/recipes",
    async (context) => {
      try {
        const source = contextFor(context.req.param("id"))
        const result = z
          .object({
            items: z.array(
              z.object({
                name: z.string(),
                slug: z.string(),
              }),
            ),
          })
          .parse(
            await (
              await mealieRequest(
                source,
                "/api/recipes?perPage=100&orderBy=name&orderDirection=asc",
              )
            ).json(),
          )
        return context.json(result)
      } catch {
        return context.json(
          {
            error:
              "Could not read Mealie recipes. Check the source URL and API token.",
          },
          400,
        )
      }
    },
  )
  app.post("/api/manage/cooking", async (context) => {
    try {
      return context.json(
        await start(await context.req.json()),
      )
    } catch (error) {
      return context.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Could not start the recipe.",
        },
        400,
      )
    }
  })
  app.use("/api/cooking/:id/*", async (context, next) => {
    if (
      !platform.access.isAdmin(context) &&
      !platform.cooking.authorize(
        context.req.param("id"),
        context.req.header("x-castkit-cooking-key"),
      )
    )
      return context.json(
        {
          error:
            "This cooking link is invalid or has ended.",
        },
        401,
      )
    context.header("Cache-Control", "no-store")
    await next()
  })
  app.get("/api/cooking/:id/state", (context) => {
    const session = platform.cooking.get(
      context.req.param("id"),
    )
    return session
      ? context.json(present(session))
      : context.json(
          { error: "This cooking session has ended." },
          404,
        )
  })
  app.post("/api/cooking/:id/command", async (context) => {
    try {
      const request = commandSchema.parse(
        await context.req.json(),
      )
      const current = platform.cooking.get(
        context.req.param("id"),
      )
      if (!current || current.revision !== request.revision)
        return context.json(
          {
            error:
              "The recipe page changed. Refresh before trying again.",
          },
          409,
        )
      const session = platform.cooking.command(
        current.id,
        request.action,
      )
      return context.json({
        session: session ? present(session) : null,
      })
    } catch {
      return context.json(
        {
          error:
            "This cooking session has ended or the command is invalid.",
        },
        409,
      )
    }
  })
  // Commands are non-retained, time-limited, correlated, and revision-checked.
  // A retained/replayed Next cannot advance a second page, including after restart.
  void platform.publisher
    .subscribe({
      topics: [`${platform.topicPrefix}/cooking/cmd`],
      handler: async (message) => {
        if (
          message.topic !==
          `${platform.topicPrefix}/cooking/cmd`
        )
          return
        let requestId = ""
        try {
          const envelope = z
            .object({
              requestId: z
                .string()
                .regex(/^[a-zA-Z0-9_-]{1,100}$/),
              issuedAt: z.number(),
              action: z.enum([
                "start",
                "next",
                "previous",
                "ingredients",
                "instructions",
                "done",
              ]),
            })
            .passthrough()
            .parse(JSON.parse(message.payload))
          requestId = envelope.requestId
          if (
            Math.abs(Date.now() - envelope.issuedAt) > 60000
          )
            throw new Error("Expired cooking command.")
          if (!platform.cooking.rememberRequest(requestId))
            throw new Error("Duplicate cooking command.")
          let session: ReturnType<typeof present> | null
          if (envelope.action === "start")
            session = await start(envelope)
          else {
            const command = z
              .object({
                sessionId: z.string().uuid(),
                revision: z.number().int().nonnegative(),
              })
              .parse(envelope)
            const current = platform.cooking.get(
              command.sessionId,
            )
            if (
              !current ||
              current.revision !== command.revision
            )
              throw new Error(
                "The session ended or the page changed.",
              )
            const updated = platform.cooking.command(
              current.id,
              envelope.action,
            )
            session = updated ? present(updated) : null
          }
          await platform.publisher.publish({
            topic: `${platform.topicPrefix}/cooking/resp/${requestId}`,
            payload: JSON.stringify({
              requestId,
              ok: true,
              session,
              controlUrl: session
                ? `${platform.publicUrl}${session.controlPath}`
                : null,
            }),
            isRetained: false,
          })
        } catch {
          if (requestId)
            await platform.publisher.publish({
              topic: `${platform.topicPrefix}/cooking/resp/${requestId}`,
              payload: JSON.stringify({
                requestId,
                ok: false,
                error:
                  "Cooking command failed. Check the session, revision, and recipe source.",
              }),
              isRetained: false,
            })
        }
      },
    })
    .catch((error) =>
      console.error(
        "[cooking] MQTT subscription failed",
        error,
      ),
    )
  let lastState = ""
  const publishState = () => {
    const state = JSON.stringify(
      platform.cooking.list().map((session) => ({
        id: session.id,
        revision: session.revision,
      })),
    )
    if (lastState === state) return
    lastState = state
    void platform.publisher
      .publish({
        topic: `${platform.topicPrefix}/cooking/state`,
        payload: JSON.stringify({
          sessions: platform.cooking
            .list()
            .map((session) => ({
              id: session.id,
              deviceId: session.deviceId,
              revision: session.revision,
              name: session.recipe.name,
              pageIndex: session.pageIndex,
              pageCount:
                platform.cooking.display(session).pageCount,
            })),
        }),
        isRetained: true,
      })
      .catch(() => {
        lastState = ""
      })
  }
  platform.subscribe(publishState)
  publishState()
  return { start, present }
}
