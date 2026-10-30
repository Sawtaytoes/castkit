import { expect, test, vi } from "vitest"
import { sourceContext } from "./__fixtures__/sourceContext.ts"
import { createSourceMedia } from "./mediaAssets.ts"

test("source media drops unapproved hosts and proxies allowed media without exposing tokens", async () => {
  const context = sourceContext({
    fetch: vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("image")),
  })
  const media = createSourceMedia(context)
  const data = media.rewrite({
    channelId: "channel",
    data: {
      artworkPath: "/picture?token=secret",
      thumbnailPath: "https://untrusted.example/image",
    },
  }) as Record<string, string>
  expect(data.thumbnailPath).toBeUndefined()
  expect(data.artworkPath).toMatch(
    /^\/api\/platform\/channels\/channel\/media\/[a-f0-9]+$/,
  )
  expect(JSON.stringify(data)).not.toContain("secret")
  await media.getMedia({
    channelId: "channel",
    assetId: data.artworkPath?.split("/").at(-1) ?? "",
  })
  expect(context.fetch).toHaveBeenCalledWith(
    "https://service.example/picture?token=secret",
    expect.objectContaining({ redirect: "error" }),
  )
  await expect(
    media.getMedia({
      channelId: "other",
      assetId: data.artworkPath?.split("/").at(-1) ?? "",
    }),
  ).rejects.toThrow("not part")
})

test("warms queue posters before channel selection without granting other channels access", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async (input) =>
      String(input).endsWith("/posters")
        ? Response.json({
            posters: [
              {
                artworkPath: "/api/chooser/poster/learning",
              },
              {
                artworkPath:
                  "https://untrusted.example/api/chooser/poster/secret",
              },
            ],
          })
        : new Response("poster", {
            headers: { "Content-Type": "image/jpeg" },
          }),
    )
  const media = createSourceMedia(
    sourceContext({ fetch: fetcher }),
  )
  await media.warmChooserPosters()
  const data = media.rewrite({
    channelId: "chooser",
    data: { artworkPath: "/api/chooser/poster/learning" },
  }) as { artworkPath: string }
  const result = await media.getMedia({
    channelId: "chooser",
    assetId: data.artworkPath.split("/").at(-1)!,
  })
  expect(await result.text()).toBe("poster")
  expect(fetcher).toHaveBeenCalledTimes(2)
  await expect(
    media.getMedia({
      channelId: "other",
      assetId: data.artworkPath.split("/").at(-1)!,
    }),
  ).rejects.toThrow("not part")
})

test.each([
  false,
  true,
])("a failed or oversized cold poster is not fetched twice (oversized: %s)", async (isOversized) => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    isOversized
      ? new Response(new Uint8Array(512_001), {
          headers: { "Content-Type": "image/jpeg" },
        })
      : new Response(null, { status: 503 }),
  )
  const media = createSourceMedia(
    sourceContext({ fetch: fetcher }),
  )
  const data = media.rewrite({
    channelId: "chooser",
    data: { artworkPath: "/api/chooser/poster/failure" },
  }) as { artworkPath: string }
  const response = await media.getMedia({
    channelId: "chooser",
    assetId: data.artworkPath.split("/").at(-1)!,
  })
  expect(response.status).toBe(404)
  expect(fetcher).toHaveBeenCalledTimes(1)
})
