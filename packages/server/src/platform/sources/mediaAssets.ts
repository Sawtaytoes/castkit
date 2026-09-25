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
  return {
    rewrite,
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
