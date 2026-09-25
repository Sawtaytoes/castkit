import type { SourceFactory } from "@castkit/sdk/plugin"
import {
  computeRecencyWeight,
  pickWeightedIndex,
} from "../../immich/immichClient.ts"
import {
  finiteNumber,
  pollingSource,
  record,
  sourceRequest,
  stringList,
  textValue,
} from "./http.ts"

/** Immich selection is source data; layout and rotation remain view settings. */
export const createImmichSource: SourceFactory = (
  context,
) => {
  const headers = {
    "x-api-key": context.secrets.apiKey ?? "",
  }
  const allowedAssets = new Map<string, Set<string>>()
  const poll = async () => {
    await Promise.all(
      context.channels.map(async (channel) => {
        try {
          const people = stringList(
            channel.settings.personIds,
          )
          const query = textValue(
            channel.settings.query,
          ).trim()
          const albumId = textValue(
            channel.settings.albumId,
          )
          const filters = people.length
            ? people.map((personId) => ({
                personIds: [personId],
              }))
            : [{}]
          const search = async ({
            filter,
            page = 1,
          }: {
            filter: Record<string, unknown>
            page?: number
          }): Promise<Record<string, unknown>[]> => {
            const response = await (
              await sourceRequest({
                context,
                headers,
                path: query
                  ? "/api/search/smart"
                  : "/api/search/metadata",
                method: "POST",
                body: {
                  ...filter,
                  ...(query ? { query } : {}),
                  type: "IMAGE",
                  isArchived: false,
                  size: 1000,
                  page,
                },
              })
            ).json()
            const results = record(record(response).assets)
            const items = (
              Array.isArray(results.items)
                ? results.items
                : []
            ).map(record)
            const nextPage = Number(results.nextPage)
            return nextPage > page && nextPage <= 5
              ? items.concat(
                  await search({ filter, page: nextPage }),
                )
              : items
          }
          const album = albumId
            ? record(
                await (
                  await sourceRequest({
                    context,
                    headers,
                    path: `/api/albums/${encodeURIComponent(albumId)}`,
                  })
                ).json(),
              )
            : undefined
          const assets = album
            ? (Array.isArray(album.assets)
                ? album.assets
                : []
              )
                .map(record)
                .filter(
                  (asset) =>
                    asset.type === "IMAGE" ||
                    asset.type === undefined,
                )
            : (
                await Promise.all(
                  filters.map((filter) =>
                    search({ filter }),
                  ),
                )
              ).flat()
          const counts = assets.reduce(
            (result, asset) =>
              result.set(
                textValue(asset.id),
                (result.get(textValue(asset.id)) ?? 0) + 1,
              ),
            new Map<string, number>(),
          )
          const minimum = Math.max(
            1,
            finiteNumber(channel.settings.peopleMinimum) ??
              1,
          )
          const unique = Array.from(
            new Map(
              assets
                .filter(
                  (asset) => typeof asset.id === "string",
                )
                .map((asset) => [
                  textValue(asset.id),
                  asset,
                ]),
            ).values(),
          )
          const matching = unique.filter(
            (asset) =>
              (counts.get(textValue(asset.id)) ?? 0) >=
              minimum,
          )
          const pool = matching.length ? matching : unique
          const halfLife = Math.max(
            1,
            finiteNumber(
              channel.settings.recencyHalfLifeDays,
            ) ?? 365,
          )
          const count = Math.max(
            1,
            Math.min(
              100,
              finiteNumber(channel.settings.assetLimit) ??
                30,
            ),
          )
          const pick = ({
            remaining,
            chosen = [],
          }: {
            remaining: Record<string, unknown>[]
            chosen?: Record<string, unknown>[]
          }): Record<string, unknown>[] => {
            if (
              chosen.length >= count ||
              !remaining.length
            ) {
              return chosen
            }
            const index = pickWeightedIndex({
              weights: remaining.map((asset) =>
                computeRecencyWeight({
                  createdAtMs:
                    Date.parse(
                      textValue(asset.fileCreatedAt),
                    ) || 0,
                  nowMs: Date.now(),
                  halfLifeDays: halfLife,
                }),
              ),
              randomValue: Math.random(),
            })
            const selected = remaining[index]
            return selected
              ? pick({
                  remaining: remaining.filter(
                    (_asset, assetIndex) =>
                      assetIndex !== index,
                  ),
                  chosen: chosen.concat(selected),
                })
              : chosen
          }
          const chosen = pick({ remaining: pool })
          allowedAssets.set(
            channel.id,
            new Set(
              chosen.map((asset) => textValue(asset.id)),
            ),
          )
          const images = await Promise.all(
            chosen.map(async (asset) => {
              const details = await sourceRequest({
                context,
                headers,
                path: `/api/assets/${encodeURIComponent(textValue(asset.id))}`,
              })
                .then((response) => response.json())
                .catch(() => ({}))
              const faces = (
                Array.isArray(record(details).people)
                  ? (record(details).people as unknown[])
                  : []
              )
                .map(record)
                .filter(
                  (person) =>
                    !people.length ||
                    people.includes(textValue(person.id)),
                )
                .flatMap((person) =>
                  Array.isArray(person.faces)
                    ? person.faces
                    : [],
                )
                .map(record)
                .filter(
                  (face) =>
                    (finiteNumber(face.imageWidth) ?? 0) >
                      0 &&
                    (finiteNumber(face.imageHeight) ?? 0) >
                      0,
                )
                .map((face) => ({
                  x1:
                    Number(face.boundingBoxX1) /
                    Number(face.imageWidth),
                  y1:
                    Number(face.boundingBoxY1) /
                    Number(face.imageHeight),
                  x2:
                    Number(face.boundingBoxX2) /
                    Number(face.imageWidth),
                  y2:
                    Number(face.boundingBoxY2) /
                    Number(face.imageHeight),
                }))
                .filter((face) =>
                  Object.values(face).every(
                    Number.isFinite,
                  ),
                )
              return {
                id: textValue(asset.id),
                url: `/api/platform/channels/${encodeURIComponent(channel.id)}/media/${encodeURIComponent(textValue(asset.id))}?kind=preview`,
                title: textValue(asset.originalFileName),
                ...(finiteNumber(asset.width)
                  ? { width: finiteNumber(asset.width) }
                  : {}),
                ...(finiteNumber(asset.height)
                  ? { height: finiteNumber(asset.height) }
                  : {}),
                faces,
              }
            }),
          )
          context.publish({
            channelId: channel.id,
            data: { images },
          })
        } catch {
          context.reportError({
            channelId: channel.id,
            error:
              "Immich could not load this photo selection.",
          })
        }
      }),
    )
  }
  return {
    ...pollingSource({
      context,
      poll,
      intervalSeconds:
        finiteNumber(context.source.settings.pollSeconds) ??
        3600,
    }),
    discover: async () => {
      const [peopleResult, albumsResult] =
        await Promise.allSettled([
          sourceRequest({
            context,
            headers,
            path: "/api/people?withHidden=false&size=1000",
          }).then((response) => response.json()),
          sourceRequest({
            context,
            headers,
            path: "/api/albums",
          }).then((response) => response.json()),
        ])
      const people =
        peopleResult.status === "fulfilled"
          ? peopleResult.value
          : {}
      const albums =
        albumsResult.status === "fulfilled"
          ? albumsResult.value
          : []
      if (
        peopleResult.status === "rejected" &&
        albumsResult.status === "rejected"
      ) {
        throw new Error(
          "Immich discovery is unavailable. Check the API key permissions.",
        )
      }
      return {
        unavailable: [
          peopleResult.status === "rejected"
            ? "people"
            : undefined,
          albumsResult.status === "rejected"
            ? "albums"
            : undefined,
        ].filter(Boolean),
        people: (Array.isArray(record(people).people)
          ? (record(people).people as unknown[])
          : []
        ).map((raw) => {
          const person = record(raw)
          return {
            id: textValue(person.id),
            name: textValue(person.name),
          }
        }),
        albums: (Array.isArray(albums) ? albums : []).map(
          (raw) => {
            const album = record(raw)
            return {
              id: textValue(album.id),
              name: textValue(album.albumName),
            }
          },
        ),
      }
    },
    getMedia: async ({ channelId, assetId }) => {
      if (!allowedAssets.get(channelId)?.has(assetId)) {
        throw new Error(
          "This photo is not part of the channel selection.",
        )
      }
      return sourceRequest({
        context,
        headers,
        path: `/api/assets/${encodeURIComponent(assetId)}/thumbnail?size=preview`,
      })
    },
  }
}
