import { expect, test, vi } from "vitest"
import { createBrowserArtworkMedia } from "./artworkMedia.ts"

const track = {
  title: "Fixture track",
  artist: "Fixture artist",
  album: "Fixture album",
  isPlaying: true,
  artworkPath:
    "https://artwork.example.test/cover?token=private",
}

test("device artwork is same-origin, preserves image bytes, and hides the upstream token", async () => {
  const fetchImage = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      new Response(new Uint8Array([137, 80, 78, 71]), {
        headers: { "Content-Type": "image/png" },
      }),
    )
  const media = createBrowserArtworkMedia({ fetchImage })
  const rewritten = media.rewrite({
    deviceId: "fixture-device",
    data: track,
  })
  expect(rewritten.artworkPath).toMatch(
    /^\/d\/fixture-device\/artwork\/[a-f0-9]{24}$/,
  )
  expect(rewritten.artworkPath).not.toContain("private")
  const assetId =
    rewritten.artworkPath?.split("/").at(-1) ?? ""
  const response = await media.get({
    deviceId: "fixture-device",
    assetId,
  })
  expect(response.status).toBe(200)
  expect(response.headers.get("content-type")).toBe(
    "image/png",
  )
  expect(
    Array.from(
      new Uint8Array(await response.arrayBuffer()),
    ),
  ).toEqual([137, 80, 78, 71])
  expect(fetchImage).toHaveBeenCalledWith(
    track.artworkPath,
    expect.objectContaining({
      redirect: "error",
      signal: expect.any(AbortSignal),
    }),
  )
  expect(
    (
      await media.get({
        deviceId: "another-device",
        assetId,
      })
    ).status,
  ).toBe(404)
  expect(fetchImage).toHaveBeenCalledTimes(1)
})

test("the artwork route cannot proxy a caller-supplied URL or a forgotten artwork ID", async () => {
  const fetchImage = vi.fn<typeof fetch>()
  const media = createBrowserArtworkMedia({ fetchImage })
  expect(
    (
      await media.get({
        deviceId: "fixture-device",
        assetId: "https://untrusted.example.test",
      })
    ).status,
  ).toBe(404)
  const first =
    media
      .rewrite({ deviceId: "fixture-device", data: track })
      .artworkPath?.split("/")
      .at(-1) ?? ""
  Array.from(
    { length: 16 },
    (_unused, index) => index,
  ).forEach((index) => {
    media.rewrite({
      deviceId: "fixture-device",
      data: {
        ...track,
        artworkPath: `https://artwork.example.test/${index}.png`,
      },
    })
  })
  expect(
    (
      await media.get({
        deviceId: "fixture-device",
        assetId: first,
      })
    ).status,
  ).toBe(404)
  expect(fetchImage).not.toHaveBeenCalled()
})

test("non-images, unavailable sources and redirects fail without forwarding source headers", async () => {
  const fetchImage = vi.fn<typeof fetch>()
  const media = createBrowserArtworkMedia({ fetchImage })
  const assetId =
    media
      .rewrite({ deviceId: "fixture-device", data: track })
      .artworkPath?.split("/")
      .at(-1) ?? ""
  const sourceResponses = [
    new Response("private", { status: 403 }),
    new Response("html", {
      headers: {
        "content-type": "text/html",
        "set-cookie": "private",
      },
    }),
  ]
  await Promise.all(
    sourceResponses.map(async (response) => {
      fetchImage.mockResolvedValueOnce(response)
      const result = await media.get({
        deviceId: "fixture-device",
        assetId,
      })
      expect(result.status).toBe(502)
      expect(result.headers.get("set-cookie")).toBeNull()
    }),
  )
  fetchImage.mockRejectedValueOnce(new Error("redirect"))
  expect(
    (
      await media.get({
        deviceId: "fixture-device",
        assetId,
      })
    ).status,
  ).toBe(502)
})

test("existing same-origin and inline artwork need no proxy", () => {
  const media = createBrowserArtworkMedia()
  const sameOriginArtworkPaths = [
    "/api/platform/channels/fixture/media/cover",
    "data:image/png;base64,fixture",
    undefined,
  ]
  sameOriginArtworkPaths.forEach((artworkPath) => {
    expect(
      media.rewrite({
        deviceId: "fixture-device",
        data: { ...track, artworkPath },
      }).artworkPath,
    ).toBe(artworkPath)
  })
  expect(
    media.rewrite({
      deviceId: "fixture-device",
      data: {
        ...track,
        artworkPath:
          "https://user:password@artwork.example.test/cover",
      },
    }).artworkPath,
  ).toBeUndefined()
})
