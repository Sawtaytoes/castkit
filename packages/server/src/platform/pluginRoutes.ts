import type { Hono } from "hono"
import { bodyLimit } from "hono/body-limit"
import { z } from "zod"
import type { PluginRuntime } from "./pluginRuntime.ts"

const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "The plugin operation failed."
/** Authenticated package installation and public, immutable renderer assets. */
export const attachPluginRoutes = ({
  app,
  plugins,
}: {
  app: Hono
  plugins: PluginRuntime
}) => {
  const base = "/api/manage/platform/plugin-packages"
  app.use(
    `${base}/*`,
    bodyLimit({
      maxSize: 20 * 1024 * 1024,
      onError: (context) =>
        context.json(
          {
            error:
              "Plugin packages must be smaller than 20 MB.",
          },
          413,
        ),
    }),
  )
  app.post(`${base}/inspect`, async (context) => {
    const input = z
      .object({
        name: z.string().min(1).max(214),
        version: z.string().max(100).optional(),
      })
      .safeParse(await context.req.json().catch(() => null))
    if (!input.success)
      return context.json(
        {
          error:
            "Enter a package name and optional version.",
        },
        400,
      )
    try {
      return context.json(await plugins.inspect(input.data))
    } catch (error) {
      return context.json({ error: message(error) }, 400)
    }
  })
  app.post(`${base}/inspect-file`, async (context) => {
    try {
      const bytes = new Uint8Array(
        await context.req.arrayBuffer(),
      )
      return context.json(
        await plugins.inspectArchive({ bytes }),
      )
    } catch (error) {
      return context.json({ error: message(error) }, 400)
    }
  })
  app.post(`${base}/install`, async (context) => {
    const input = z
      .object({ inspectionId: z.string().min(1).max(100) })
      .safeParse(await context.req.json().catch(() => null))
    if (!input.success)
      return context.json(
        {
          error:
            "Review a plugin package before installing it.",
        },
        400,
      )
    try {
      return context.json({
        package: await plugins.install(
          input.data.inspectionId,
        ),
      })
    } catch (error) {
      return context.json({ error: message(error) }, 409)
    }
  })
  app.delete(`${base}/:id`, async (context) => {
    try {
      await plugins.remove(context.req.param("id"))
      return context.json({ ok: true })
    } catch (error) {
      return context.json({ error: message(error) }, 409)
    }
  })
  app.get(
    "/api/plugins/assets/:installationId/*",
    async (context) => {
      try {
        const installationId = context.req.param(
          "installationId",
        )
        const prefix = `/api/plugins/assets/${installationId}/`
        const asset = await plugins.readAsset({
          installationId,
          path: decodeURIComponent(
            context.req.path.slice(prefix.length),
          ),
        })
        return new Response(
          new Uint8Array(asset.bytes).buffer,
          {
            headers: {
              "Content-Type": asset.contentType,
              "X-Content-Type-Options": "nosniff",
              "Cache-Control":
                "public, max-age=31536000, immutable",
            },
          },
        )
      } catch {
        return context.json(
          { error: "Plugin asset not found" },
          404,
        )
      }
    },
  )
}
