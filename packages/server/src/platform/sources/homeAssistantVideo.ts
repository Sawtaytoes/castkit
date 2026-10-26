import type { SourceContext } from "@castkit/sdk/plugin"
import { requestHomeAssistantStream } from "./homeAssistantHls.ts"
import { sourceRequest, sourceUrl } from "./http.ts"

const REQUEST_TIMEOUT_MILLISECONDS = 10_000

/** One low-latency HLS part, in playlist order. */
export type PlaylistPart = {
  mediaSequence: number
  index: number
  uri: string
  isIndependent: boolean
}

/** The parts of a low-latency media playlist that a reader follows. */
export type LowLatencyPlaylist = {
  mapUri: string | undefined
  parts: PlaylistPart[]
  /** Media sequence numbers whose whole segment is listed. */
  completeSegments: Set<number>
  firstMediaSequence: number
}

const readAttribute = (line: string, name: string) =>
  new RegExp(`(?:^|[:,])${name}=("([^"]*)"|[^,]*)`).exec(
    line,
  )

/**
 * Read the parts of a Home Assistant low-latency media playlist.
 *
 * Parts are listed before the segment they belong to, and the trailing parts
 * belong to the segment still being written.
 */
export const parseLowLatencyPlaylist = (
  text: string,
): LowLatencyPlaylist => {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
  const firstMediaSequence = Number(
    lines
      .find((line) =>
        line.startsWith("#EXT-X-MEDIA-SEQUENCE:"),
      )
      ?.slice("#EXT-X-MEDIA-SEQUENCE:".length) ?? 0,
  )
  const mapLine = lines.find((line) =>
    line.startsWith("#EXT-X-MAP:"),
  )
  const mapMatch = mapLine
    ? readAttribute(mapLine, "URI")
    : null
  const walk = lines.reduce(
    (state, line) => {
      if (line.startsWith("#EXT-X-PART:")) {
        const uri = readAttribute(line, "URI")
        if (!uri) return state
        return {
          ...state,
          parts: state.parts.concat({
            mediaSequence: state.mediaSequence,
            index: state.partIndex,
            uri: uri[2] ?? uri[1] ?? "",
            isIndependent:
              readAttribute(line, "INDEPENDENT")?.[1] ===
              "YES",
          }),
          partIndex: state.partIndex + 1,
        }
      }
      if (line.startsWith("#")) return state
      return {
        ...state,
        completeSegments: state.completeSegments.concat(
          state.mediaSequence,
        ),
        mediaSequence: state.mediaSequence + 1,
        partIndex: 0,
      }
    },
    {
      mediaSequence: firstMediaSequence,
      partIndex: 0,
      parts: [] as PlaylistPart[],
      completeSegments: [] as number[],
    },
  )
  return {
    mapUri: mapMatch
      ? (mapMatch[2] ?? mapMatch[1])
      : undefined,
    parts: walk.parts,
    completeSegments: new Set(walk.completeSegments),
    firstMediaSequence,
  }
}

/** The part a reader asks for after `cursor`, given what the playlist lists. */
export const nextPartCursor = ({
  playlist,
  cursor,
}: {
  playlist: LowLatencyPlaylist
  cursor: { mediaSequence: number; index: number }
}) => {
  const isListed = playlist.parts.some(
    (part) =>
      part.mediaSequence === cursor.mediaSequence &&
      part.index === cursor.index + 1,
  )
  return !isListed &&
    playlist.completeSegments.has(cursor.mediaSequence)
    ? { mediaSequence: cursor.mediaSequence + 1, index: 0 }
    : {
        mediaSequence: cursor.mediaSequence,
        index: cursor.index + 1,
      }
}

/**
 * The newest part a decoder can start from: the last independent part, so the
 * first bytes it reads begin with a key frame and nothing older is replayed.
 */
export const findStartPart = (
  playlist: LowLatencyPlaylist,
) => playlist.parts.findLast((part) => part.isIndependent)

/**
 * Follow a Home Assistant camera's low-latency HLS stream part by part and
 * hand the bytes on as one fragmented MP4 stream: the init section, then each
 * part as it is published. A part is about one second long, so the bytes reach
 * a decoder about a second after the camera publishes them, where a whole-
 * segment HLS reader runs a segment or more behind.
 *
 * The stream ends with an error when it falls out of the playlist window or the
 * playlist offers no parts; the caller starts a new one.
 */
export const openHomeAssistantVideo = ({
  context,
  headers,
  entityId,
  signal,
}: {
  context: SourceContext
  headers: Record<string, string>
  entityId: string
  signal: AbortSignal
}) => {
  const controller = new AbortController()
  const combined = AbortSignal.any([
    signal,
    controller.signal,
  ])
  const requestContext = { ...context, signal: combined }
  const read = async (path: string) =>
    sourceRequest({
      context: requestContext,
      headers,
      path,
      timeoutMilliseconds: REQUEST_TIMEOUT_MILLISECONDS,
    })
  const resolvePath = ({
    uri,
    playlistPath,
    prefix,
  }: {
    uri: string
    playlistPath: string
    prefix: string
  }) => {
    const base = sourceUrl({
      baseUrl: context.source.settings.url,
      path: playlistPath,
    })
    const resolved = new URL(uri, base)
    if (
      resolved.origin !== new URL(base).origin ||
      !resolved.pathname.startsWith(prefix) ||
      resolved.search
    )
      throw new Error(
        "Home Assistant playlist referenced another resource.",
      )
    return resolved.pathname
  }
  const run = async (
    enqueue: (bytes: Uint8Array) => void,
  ) => {
    const url = await requestHomeAssistantStream({
      baseUrl: String(context.source.settings.url),
      token: context.secrets.token ?? "",
      entityId,
      signal: combined,
    })
    const master = new URL(url, "http://source.invalid")
    const match =
      /^\/api\/hls\/[a-f0-9]+\/master_playlist\.m3u8$/.exec(
        master.pathname,
      )
    if (!match || master.search)
      throw new Error(
        "Home Assistant returned an invalid camera stream URL.",
      )
    const prefix = master.pathname.slice(
      0,
      -"master_playlist.m3u8".length,
    )
    const masterText = await (
      await read(master.pathname)
    ).text()
    const child = masterText
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith("#"))
    if (!child)
      throw new Error(
        "Home Assistant listed no camera playlist.",
      )
    const playlistPath = resolvePath({
      uri: child,
      playlistPath: master.pathname,
      prefix,
    })
    const first = parseLowLatencyPlaylist(
      await (await read(playlistPath)).text(),
    )
    const start = findStartPart(first)
    if (!first.mapUri || !start)
      throw new Error(
        "The camera stream offers no low-latency parts.",
      )
    enqueue(
      new Uint8Array(
        await (
          await read(
            resolvePath({
              uri: first.mapUri,
              playlistPath,
              prefix,
            }),
          )
        ).arrayBuffer(),
      ),
    )
    const state = {
      playlist: first,
      cursor: {
        mediaSequence: start.mediaSequence,
        index: start.index,
      },
    }
    while (!combined.aborted) {
      const part = state.playlist.parts.find(
        (item) =>
          item.mediaSequence ===
            state.cursor.mediaSequence &&
          item.index === state.cursor.index,
      )
      if (part) {
        enqueue(
          new Uint8Array(
            await (
              await read(
                resolvePath({
                  uri: part.uri,
                  playlistPath,
                  prefix,
                }),
              )
            ).arrayBuffer(),
          ),
        )
        state.cursor = nextPartCursor({
          playlist: state.playlist,
          cursor: state.cursor,
        })
      } else if (
        state.playlist.parts.length > 0 &&
        (state.cursor.mediaSequence <
          (state.playlist.parts[0]?.mediaSequence ?? 0) ||
          (state.cursor.mediaSequence ===
            state.playlist.parts[0]?.mediaSequence &&
            state.cursor.index <
              (state.playlist.parts[0]?.index ?? 0)))
      ) {
        throw new Error(
          "The camera stream moved past this reader.",
        )
      } else if (
        state.cursor.index > 0 &&
        state.playlist.completeSegments.has(
          state.cursor.mediaSequence,
        )
      ) {
        // The segment ended before this part; its successor starts the next one.
        state.cursor = {
          mediaSequence: state.cursor.mediaSequence + 1,
          index: 0,
        }
      } else {
        // A blocking reload answers as soon as the part exists.
        state.playlist = parseLowLatencyPlaylist(
          await (
            await read(
              `${playlistPath}?_HLS_msn=${state.cursor.mediaSequence}&_HLS_part=${state.cursor.index}`,
            )
          ).text(),
        )
      }
    }
  }
  return new ReadableStream<Uint8Array>({
    start: (stream) => {
      const finish = (error?: unknown) => {
        try {
          if (error !== undefined && !combined.aborted)
            stream.error(error)
          else stream.close()
        } catch {
          // A canceled stream is already finished.
        }
      }
      run((bytes) => {
        if (!combined.aborted) stream.enqueue(bytes)
      })
        .then(() => finish())
        .catch((error: unknown) =>
          finish(
            error ?? new Error("Camera stream ended."),
          ),
        )
    },
    cancel: () => {
      controller.abort()
    },
  })
}
