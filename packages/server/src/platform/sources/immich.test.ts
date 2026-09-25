import { expect, test, vi } from "vitest"
import { sourceContext } from "./__fixtures__/sourceContext.ts"
import { createImmichSource } from "./immich.ts"

test("Immich selection unions people, normalizes face coordinates and scopes media", async () => {
  const fetchRequest = vi
    .fn<typeof fetch>()
    .mockImplementation(
      async (url) =>
        new Response(
          JSON.stringify(
            String(url).includes("search")
              ? {
                  assets: {
                    items: [
                      {
                        id: "photo-one",
                        originalFileName: "Photo.jpg",
                        fileCreatedAt: "2026-01-01",
                        width: 800,
                        height: 600,
                      },
                    ],
                  },
                }
              : {
                  people: [
                    {
                      id: "person-one",
                      faces: [
                        {
                          imageWidth: 800,
                          imageHeight: 600,
                          boundingBoxX1: 80,
                          boundingBoxY1: 60,
                          boundingBoxX2: 400,
                          boundingBoxY2: 300,
                        },
                      ],
                    },
                  ],
                },
          ),
        ),
    )
  const context = sourceContext({
    fetch: fetchRequest,
    channels: [
      {
        id: "photos",
        name: "Photos",
        sourceId: "source",
        type: "images.v1",
        settings: {
          personIds: ["person-one", "person-two"],
          peopleMinimum: 2,
        },
      },
    ],
  })
  const adapter = createImmichSource(context)
  await adapter.start?.()
  expect(context.publish).toHaveBeenCalledWith({
    channelId: "photos",
    data: {
      images: [
        {
          id: "photo-one",
          title: "Photo.jpg",
          url: "/api/platform/channels/photos/media/photo-one?kind=preview",
          width: 800,
          height: 600,
          faces: [{ x1: 0.1, y1: 0.1, x2: 0.5, y2: 0.5 }],
        },
      ],
    },
  })
  await expect(
    adapter.getMedia?.({
      channelId: "photos",
      assetId: "other-photo",
    }),
  ).rejects.toThrow("not part")
  await adapter.getMedia?.({
    channelId: "photos",
    assetId: "photo-one",
  })
  expect(fetchRequest.mock.calls.at(-1)?.[0]).toBe(
    "https://service.example/api/assets/photo-one/thumbnail?size=preview",
  )
  expect(
    fetchRequest.mock.calls.at(-1)?.[1]?.headers,
  ).toEqual({ "x-api-key": "test-key" })
  adapter.dispose()
})
