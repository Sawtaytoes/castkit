import { createHash } from "node:crypto"
import type { SourceContext } from "@castkit/sdk/plugin"
import { sourceUrl, stringList } from "./http.ts"

const mediaKeys = new Set([
  "artworkPath",
  "thumbnailPath",
  "cameraPath",
  "posterUrl",
  "url",
])
/** Proxy only media from the configured service or administrator-approved origins. */
export const createSourceMedia = (
  context: SourceContext,
) => {
  const assets = new Map<string, Map<string, string>>()
  const baseUrl =
    context.source.settings.mediaUrl ??
    context.source.settings.url
  const allowedOrigins = new Set(
    stringList(
      context.source.settings.mediaOrigins,
    ).flatMap((value) => {
      try {
        const parsed = new URL(value)
        return [parsed.origin]
      } catch {
        return []
      }
    }),
  )
  try {
    allowedOrigins.add(
      new URL(sourceUrl({ baseUrl, path: "/" })).origin,
    )
  } catch {
    /* A pure MQTT source may have no media origin. */
  }
  const resolve = (value: string) => {
    try {
      const url = new URL(
        value,
        typeof baseUrl === "string" ? baseUrl : undefined,
      )
      return ["http:", "https:"].includes(url.protocol) &&
        !url.username &&
        !url.password &&
        allowedOrigins.has(url.origin)
        ? url.toString()
        : undefined
    } catch {
      return undefined
    }
  }
  const rewrite = ({
    channelId,
    data,
  }: {
    channelId: string
    data: unknown
  }) => {
    const channelAssets = new Map<string, string>()
    const visit = (value: unknown): unknown => {
      if (Array.isArray(value)) {
        return value.map(visit)
      }
      if (typeof value !== "object" || value === null) {
        return value
      }
      return Object.fromEntries(
        Object.entries(value).flatMap(([key, entry]) => {
          if (
            mediaKeys.has(key) &&
            typeof entry === "string"
          ) {
            const url = resolve(entry)
            if (!url) {
              return []
            }
            const assetId = createHash("sha256")
              .update(url)
              .digest("hex")
              .slice(0, 24)
            channelAssets.set(assetId, url)
            return [
              [
                key,
                `/api/platform/channels/${encodeURIComponent(channelId)}/media/${assetId}`,
              ],
            ]
          }
          return [[key, visit(entry)]]
        }),
      )
    }
    const rewritten = visit(data)
    assets.set(channelId, channelAssets)
    return rewritten
  }
  const cached = new Map<
    string,
    { bytes: Uint8Array; type: string; at: number }
  >()
  const pending = new Map<string, Promise<void>>()
  const loadPoster = (url: string) => {
    const active = pending.get(url)
    if (active) return active
    const request = context
      .fetch(url, {
        signal: AbortSignal.any([
          context.signal,
          AbortSignal.timeout(10000),
        ]),
        redirect: "error",
      })
      .then(async (response) => {
        if (
          !response.ok ||
          !response.headers
            .get("content-type")
            ?.startsWith("image/")
        )
          return
        const reader = response.body?.getReader()
        if (!reader) return
        const payload = {
          bytes: new Uint8Array(512_000),
          length: 0,
        }
        const read = async (): Promise<boolean> => {
          const chunk = await reader.read()
          if (chunk.done) return true
          if (
            payload.length + chunk.value.byteLength >
            payload.bytes.byteLength
          ) {
            await reader.cancel()
            return false
          }
          payload.bytes.set(chunk.value, payload.length)
          payload.length += chunk.value.byteLength
          return read()
        }
        if (!(await read())) return
        const bytes = payload.bytes.slice(0, payload.length)
        if (cached.size >= 128 && !cached.has(url))
          cached.delete(cached.keys().next().value ?? "")
        cached.set(url, {
          bytes,
          type: response.headers.get("content-type")!,
          at: Date.now(),
        })
      })
      .catch(() => undefined)
      .finally(() => pending.delete(url))
    pending.set(url, request)
    return request
  }
  const warmChooserPosters = async () => {
    const manifest = resolve("/api/chooser/posters")
    if (!manifest) return
    try {
      const response = await context.fetch(manifest, {
        signal: AbortSignal.any([
          context.signal,
          AbortSignal.timeout(10000),
        ]),
        redirect: "error",
      })
      if (!response.ok) return
      const data = (await response.json()) as {
        posters?: { artworkPath?: string }[]
      }
      await (data.posters ?? [])
        .slice(0, 128)
        .reduce(async (previous, poster) => {
          await previous
          const url =
            poster.artworkPath &&
            resolve(poster.artworkPath)
          if (
            url &&
            new URL(url).pathname.startsWith(
              "/api/chooser/poster/",
            )
          )
            await loadPoster(url)
        }, Promise.resolve())
    } catch {
      /* Unavailable artwork never blocks MQTT scans. */
    }
  }
  return {
    rewrite,
    warmChooserPosters,
    getMedia: async ({
      channelId,
      assetId,
    }: {
      channelId: string
      assetId: string
    }) => {
      const url = assets.get(channelId)?.get(assetId)
      if (!url) {
        throw new Error(
          "This media is not part of the channel.",
        )
      }
      if (
        new URL(url).pathname.startsWith(
          "/api/chooser/poster/",
        )
      ) {
        const image = cached.get(url)
        if (!image || Date.now() - image.at > 300_000) {
          if (image) void loadPoster(url)
          else await loadPoster(url)
        }
        const ready = cached.get(url)
        if (ready)
          return new Response(new Uint8Array(ready.bytes), {
            headers: {
              "Content-Type": ready.type,
              "Cache-Control": "private, max-age=300",
            },
          })
        return new Response(null, { status: 404 })
      }
      const response = await context.fetch(url, {
        signal: AbortSignal.any([
          context.signal,
          AbortSignal.timeout(10000),
        ]),
        redirect: "error",
      })
      if (!response.ok) {
        throw new Error("The source media is unavailable.")
      }
      return response
    },
  }
}
