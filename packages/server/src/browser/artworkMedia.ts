import { createHash } from "node:crypto"
import type { NowPlayingData } from "@castkit/shared/viewData/types"

/** Serve only artwork supplied by a registered device's trusted music feed. */
export const createBrowserArtworkMedia = ({
  fetchImage = fetch,
}: {
  fetchImage?: typeof fetch
} = {}) => {
  const assets = new Map<string, Map<string, string>>()
  const rewrite = ({
    deviceId,
    data,
  }: {
    deviceId: string
    data: NowPlayingData
  }) => {
    if (
      !data.artworkPath ||
      !/^https?:\/\//i.test(data.artworkPath)
    )
      return data
    try {
      const url = new URL(data.artworkPath)
      if (url.username || url.password)
        return { ...data, artworkPath: undefined }
      const imageUrl = url.toString()
      const assetId = createHash("sha256")
        .update(imageUrl)
        .digest("hex")
        .slice(0, 24)
      const deviceAssets =
        assets.get(deviceId) ?? new Map<string, string>()
      if (
        !deviceAssets.has(assetId) &&
        deviceAssets.size >= 16
      ) {
        const oldest = deviceAssets.keys().next().value
        if (oldest) deviceAssets.delete(oldest)
      }
      deviceAssets.set(assetId, imageUrl)
      assets.set(deviceId, deviceAssets)
      return {
        ...data,
        artworkPath: `/d/${encodeURIComponent(deviceId)}/artwork/${assetId}`,
      }
    } catch {
      return { ...data, artworkPath: undefined }
    }
  }
  return {
    rewrite,
    get: async ({
      deviceId,
      assetId,
    }: {
      deviceId: string
      assetId: string
    }) => {
      const imageUrl = assets.get(deviceId)?.get(assetId)
      if (!imageUrl)
        return new Response(null, { status: 404 })
      try {
        const response = await fetchImage(imageUrl, {
          signal: AbortSignal.timeout(10000),
          redirect: "error",
        })
        const contentType =
          response.headers.get("content-type") ?? ""
        if (
          !response.ok ||
          !contentType.startsWith("image/")
        )
          return new Response(null, { status: 502 })
        return new Response(response.body, {
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "private, max-age=3600",
            "X-Content-Type-Options": "nosniff",
          },
        })
      } catch {
        return new Response(null, { status: 502 })
      }
    },
  }
}
