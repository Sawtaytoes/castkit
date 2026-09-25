import {
  mkdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Hono } from "hono"
import type { Platform } from "./platform.ts"
import { getDisplay } from "./platformRoutes.ts"

/** Authorized, bounded tile proxy; cache reuse follows OpenStreetMap's tile policy. */
export const attachMapTiles = ({
  app,
  platform,
}: {
  app: Hono
  platform: Platform
}) => {
  const directory = join(tmpdir(), "castkit-map-tiles")
  const requests = new Map<string, Promise<Buffer>>()
  app.get(
    "/api/display/:kind/:id/tiles/:zoom/:horizontal/:vertical",
    async (context) => {
      const kind = context.req.param("kind")
      if (kind !== "view" && kind !== "screen")
        return context.text("Unknown display", 404)
      const result = getDisplay({
        platform,
        context,
        kind,
        id: context.req.param("id"),
      })
      if (!result.snapshot)
        return context.json(result, result.status)
      if (
        !result.snapshot.view.panels.some(
          (panel) => panel.specId === "map",
        )
      )
        return context.text(
          "Map is not part of this view",
          403,
        )
      const zoom = Number(context.req.param("zoom"))
      const horizontal = Number(
        context.req.param("horizontal"),
      )
      const vertical = Number(
        context.req.param("vertical").replace(/\.png$/, ""),
      )
      if (
        ![zoom, horizontal, vertical].every(
          Number.isInteger,
        ) ||
        zoom < 0 ||
        zoom > 18 ||
        horizontal < 0 ||
        vertical < 0 ||
        horizontal >= 2 ** zoom ||
        vertical >= 2 ** zoom
      )
        return context.text("Invalid tile", 400)
      const key = `${zoom}-${horizontal}-${vertical}.png`
      const filename = join(directory, key)
      const load = async () => {
        try {
          const metadata = await stat(filename)
          if (Date.now() - metadata.mtimeMs < 7 * 86400000)
            return await readFile(filename)
        } catch {
          /* The first visit needs an upstream tile. */
        }
        const response = await fetch(
          `https://tile.openstreetmap.org/${zoom}/${horizontal}/${vertical}.png`,
          {
            headers: {
              "User-Agent":
                "CastKit/1.0 (+https://github.com/Sawtaytoes/castkit)",
              ...(context.req.header("referer")
                ? {
                    Referer:
                      context.req.header("referer") ?? "",
                  }
                : {}),
            },
            redirect: "error",
            signal: AbortSignal.timeout(10000),
          },
        )
        if (
          !response.ok ||
          !response.headers
            .get("content-type")
            ?.startsWith("image/png")
        )
          throw new Error("Tile unavailable")
        const bytes = Buffer.from(
          await response.arrayBuffer(),
        )
        if (bytes.length > 1024 * 1024)
          throw new Error("Tile too large")
        await mkdir(directory, { recursive: true })
        await writeFile(filename, bytes)
        return bytes
      }
      try {
        if (!requests.has(key)) {
          const request = load().finally(() =>
            requests.delete(key),
          )
          requests.set(key, request)
        }
        const bytes = await requests.get(key)
        if (!bytes)
          throw new Error("Tile request was canceled")
        return new Response(new Uint8Array(bytes), {
          headers: {
            "Content-Type": "image/png",
            "Cache-Control": "private, max-age=604800",
            "X-Content-Type-Options": "nosniff",
          },
        })
      } catch {
        return context.text(
          "Map tiles are temporarily unavailable",
          502,
        )
      }
    },
  )
}
