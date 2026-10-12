import type { ContractData } from "@castkit/sdk/contracts"
import type {
  SourceContext,
  SourceFactory,
} from "@castkit/sdk/plugin"
import {
  finiteNumber,
  record,
  sourceUrl,
  stringList,
  textValue,
} from "./http.ts"
import { createSourceMedia } from "./mediaAssets.ts"

type MusicPlayerData = ContractData["music-player.v1"]
type MusicQueueItem = NonNullable<
  MusicPlayerData["queue"]
>["items"][number]
type RawRecord = Record<string, unknown>

/** Rows drawn before the current track: the "played" part of the queue. */
export const PLAYED_ROW_COUNT = 3
/** Rows fetched after the current track. A panel draws only the rows that fit. */
export const UPCOMING_ROW_COUNT = 40
/** Waveform bins sent to a panel; enough for one bar per pixel at 1024 x 600. */
export const WAVEFORM_BIN_COUNT = 300
/** Music Assistant's image proxy only answers these sizes. */
const ARTWORK_SIZE = 256
/** A reported position this far from the extrapolated one is a seek, not drift. */
const POSITION_JUMP_SECONDS = 2

const playerStates = new Set(["playing", "paused", "idle"])
const repeatModes = new Set(["off", "one", "all"])

/** A source-side playback state, mapped onto the contract's four. */
const readPlayerState = (player: RawRecord) =>
  player.available === false
    ? ("unavailable" as const)
    : playerStates.has(textValue(player.playback_state))
      ? (textValue(player.playback_state) as
          | "playing"
          | "paused"
          | "idle")
      : ("idle" as const)

const readIsGroup = (player: RawRecord) =>
  player.type === "group"

const readArtistText = (mediaItem: RawRecord) =>
  (Array.isArray(mediaItem.artists) ? mediaItem.artists : [])
    .map((artist) => textValue(record(artist).name))
    .filter(Boolean)
    .join(", ")

/**
 * Split a queue row's display name, "Artist - Title", when the row carries
 * no media item. Music Assistant names a row that way for streams and radio.
 */
const splitDisplayName = (name: string) => {
  const separatorIndex = name.indexOf(" - ")
  return separatorIndex > 0
    ? {
        artist: name.slice(0, separatorIndex),
        title: name.slice(separatorIndex + 3),
      }
    : { artist: "", title: name }
}

/** Music Assistant's own image proxy address for an image record, at a size it serves. */
export const readArtworkUrl = ({
  image,
  baseUrl,
}: {
  image: unknown
  baseUrl: unknown
}) => {
  const proxyId = textValue(record(image).proxy_id)
  if (!/^[0-9a-f]{64}$/.test(proxyId)) {
    return undefined
  }
  try {
    return sourceUrl({
      baseUrl,
      path: `/imageproxy/${proxyId}?size=${ARTWORK_SIZE}`,
    })
  } catch {
    return undefined
  }
}

/** One Music Assistant queue row as the contract's queue item. */
export const normalizeQueueItem = ({
  item,
  fallbackIndex,
  baseUrl,
}: {
  item: unknown
  fallbackIndex: number
  baseUrl: unknown
}): MusicQueueItem | undefined => {
  const row = record(item)
  const queueItemId = textValue(row.queue_item_id)
  if (!queueItemId) {
    return undefined
  }
  const mediaItem = record(row.media_item)
  const named = splitDisplayName(textValue(row.name))
  const title = textValue(mediaItem.name) || named.title
  const artist = readArtistText(mediaItem) || named.artist
  const album = textValue(record(mediaItem.album).name)
  const durationSeconds =
    finiteNumber(row.duration) ??
    finiteNumber(mediaItem.duration)
  const artworkPath = readArtworkUrl({
    image: row.image ?? mediaItem.image,
    baseUrl,
  })
  const index = finiteNumber(row.index)
  return {
    queueItemId,
    index:
      index !== undefined &&
      Number.isInteger(index) &&
      index >= 0
        ? index
        : fallbackIndex,
    title,
    artist,
    ...(album ? { album } : {}),
    ...(durationSeconds !== undefined &&
    durationSeconds >= 0
      ? { durationSeconds }
      : {}),
    ...(artworkPath ? { artworkPath } : {}),
    isAvailable: row.available !== false,
  }
}

/**
 * Reduce Music Assistant's 1800-point loudness curve to `binCount` points by
 * taking each span's peak, so a short loud hit survives the reduction.
 */
export const downsampleWaveform = ({
  values,
  binCount = WAVEFORM_BIN_COUNT,
}: {
  values: unknown
  binCount?: number
}) => {
  const levels = (Array.isArray(values) ? values : []).map(
    (value) =>
      Math.min(1, Math.max(0, finiteNumber(value) ?? 0)),
  )
  if (!levels.length || binCount < 1) {
    return undefined
  }
  const count = Math.min(binCount, levels.length)
  return Array.from({ length: count }, (_, binIndex) => {
    const start = Math.floor(
      (binIndex * levels.length) / count,
    )
    const end = Math.max(
      start + 1,
      Math.floor(((binIndex + 1) * levels.length) / count),
    )
    return Math.round(
      Math.max(...levels.slice(start, end)) * 1000,
    ) / 1000
  })
}

const LRC_TIME_TAG = /\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g

/**
 * Parse LRC lyrics into timed lines. A line may carry several time tags when
 * a chorus repeats; each becomes its own line. Metadata tags such as
 * `[ar:…]` carry no time and are dropped.
 */
export const parseLrcLyrics = (lrc: string) =>
  lrc
    .split(/\r?\n/)
    .flatMap((line) => {
      const tags = Array.from(line.matchAll(LRC_TIME_TAG))
      const text = line.replace(LRC_TIME_TAG, "").trim()
      return tags.map((tag) => ({
        startSeconds:
          Math.round(
            (Number(tag[1]) * 60 +
              Number((tag[2] ?? "0").replace(":", "."))) *
              100,
          ) / 100,
        text: text.slice(0, 1000),
      }))
    })
    .sort(
      (first, second) =>
        first.startSeconds - second.startSeconds,
    )
    .slice(0, 2000)

/** Synced lyrics when the source has them, plain lyrics otherwise. */
export const normalizeLyrics = (
  result: unknown,
): MusicPlayerData["lyrics"] => {
  const [plain, synced] = Array.isArray(result)
    ? result
    : []
  const syncedLines =
    typeof synced === "string" ? parseLrcLyrics(synced) : []
  if (syncedLines.length) {
    return { isSynced: true, lines: syncedLines }
  }
  const plainLines =
    typeof plain === "string"
      ? plain
          .split(/\r?\n/)
          .map((line) => ({ text: line.trim().slice(0, 1000) }))
          .slice(0, 2000)
      : []
  return plainLines.some((line) => line.text)
    ? { isSynced: false, lines: plainLines }
    : undefined
}

/**
 * The player a channel shows. A person's choice wins while it is still one of
 * the channel's players; otherwise the first configured player that is
 * playing, then the first that is paused, then the first that is available.
 */
export const choosePlayerId = ({
  playerIds,
  players,
  manualPlayerId,
}: {
  playerIds: string[]
  players: Map<string, RawRecord>
  manualPlayerId: string | undefined
}) => {
  if (
    manualPlayerId &&
    playerIds.includes(manualPlayerId) &&
    players.has(manualPlayerId)
  ) {
    return manualPlayerId
  }
  const known = playerIds.filter((playerId) =>
    players.has(playerId),
  )
  const withState = (state: string) =>
    known.find(
      (playerId) =>
        readPlayerState(players.get(playerId) ?? {}) ===
        state,
    )
  return (
    withState("playing") ??
    withState("paused") ??
    known.find(
      (playerId) =>
        players.get(playerId)?.available !== false,
    ) ??
    known[0]
  )
}

/** The players a person may sync with this one, and which already are. */
const readMembers = ({
  player,
  players,
}: {
  player: RawRecord
  players: Map<string, RawRecord>
}) => {
  const playerId = textValue(player.player_id)
  const memberIds = stringList(player.group_members)
  const candidateIds = [
    ...new Set(
      (readIsGroup(player)
        ? stringList(player.static_group_members)
        : stringList(player.can_group_with)
      ).concat(memberIds),
    ),
  ].filter(
    (candidateId) =>
      candidateId !== playerId && players.has(candidateId),
  )
  return candidateIds.slice(0, 200).map((candidateId) => {
    const candidate = players.get(candidateId) ?? {}
    return {
      id: candidateId,
      name:
        textValue(candidate.display_name) ||
        textValue(candidate.name) ||
        candidateId,
      isMember: memberIds.includes(candidateId),
      isAvailable: candidate.available !== false,
    }
  })
}

const readPlayerName = (player: RawRecord) =>
  textValue(player.display_name) ||
  textValue(player.name) ||
  textValue(player.player_id)

/** Assemble one channel's snapshot from the source's cached Music Assistant state. */
export const buildMusicPlayerData = ({
  playerIds,
  players,
  manualPlayerId,
  queue,
  queueWindow,
  extras,
  baseUrl,
}: {
  playerIds: string[]
  players: Map<string, RawRecord>
  manualPlayerId: string | undefined
  queue: RawRecord | undefined
  queueWindow: { offset: number; items: unknown[] } | undefined
  extras:
    | {
        waveform?: number[]
        lyrics?: MusicPlayerData["lyrics"]
      }
    | undefined
  baseUrl: unknown
}): MusicPlayerData => {
  const chosenId = choosePlayerId({
    playerIds,
    players,
    manualPlayerId,
  })
  const player = chosenId ? players.get(chosenId) : undefined
  const isGroup = player ? readIsGroup(player) : false
  const volume = player
    ? finiteNumber(
        isGroup ? player.group_volume : player.volume_level,
      )
    : undefined
  const isMuted = player
    ? (isGroup ? player.group_volume_muted : player.volume_muted)
    : undefined
  const items = (queueWindow?.items ?? [])
    .map((item, position) =>
      normalizeQueueItem({
        item,
        fallbackIndex: (queueWindow?.offset ?? 0) + position,
        baseUrl,
      }),
    )
    .filter((item) => item !== undefined)
    .slice(0, 100)
  const currentIndex = finiteNumber(queue?.current_index)
  const current = items.find(
    (item) => item.index === currentIndex,
  )
  const currentMedia = record(
    record(
      (queueWindow?.items ?? []).find(
        (item) =>
          textValue(record(item).queue_item_id) ===
          current?.queueItemId,
      ),
    ).media_item,
  )
  const elapsedSeconds = finiteNumber(queue?.elapsed_time)
  const elapsedUpdatedAt = finiteNumber(
    queue?.elapsed_time_last_updated,
  )
  const repeat = textValue(queue?.repeat_mode)
  return {
    ...(player
      ? {
          player: {
            id: textValue(player.player_id),
            name: readPlayerName(player),
            state: readPlayerState(player),
            ...(volume !== undefined
              ? {
                  volume: Math.min(100, Math.max(0, volume)),
                }
              : {}),
            ...(typeof isMuted === "boolean"
              ? { isMuted }
              : {}),
            isGroup,
            isMemberControlAvailable: stringList(
              player.supported_features,
            ).includes("set_members"),
            members: readMembers({ player, players }),
          },
        }
      : {}),
    players: playerIds.flatMap((playerId) => {
      const entry = players.get(playerId)
      return entry
        ? [
            {
              id: playerId,
              name: readPlayerName(entry),
              state: readPlayerState(entry),
              isGroup: readIsGroup(entry),
            },
          ]
        : []
    }),
    isAutomaticSelection: !(
      manualPlayerId && manualPlayerId === chosenId
    ),
    ...(queue && textValue(queue.queue_id)
      ? {
          queue: {
            id: textValue(queue.queue_id),
            itemCount: Math.max(
              0,
              Math.trunc(finiteNumber(queue.items) ?? 0),
            ),
            ...(currentIndex !== undefined &&
            Number.isInteger(currentIndex) &&
            currentIndex >= 0
              ? { currentIndex }
              : {}),
            isShuffled: queue.shuffle_enabled === true,
            repeat: repeatModes.has(repeat)
              ? (repeat as "off" | "one" | "all")
              : "off",
            items,
          },
        }
      : {}),
    ...(current
      ? {
          current: {
            ...current,
            isFavorite: currentMedia.favorite === true,
          },
        }
      : {}),
    ...(current &&
    elapsedSeconds !== undefined &&
    elapsedUpdatedAt !== undefined
      ? {
          positionSeconds: Math.max(0, elapsedSeconds),
          positionUpdatedAtMs: Math.round(
            elapsedUpdatedAt * 1000,
          ),
        }
      : {}),
    ...(current && extras?.waveform
      ? { waveform: extras.waveform }
      : {}),
    ...(current && extras?.lyrics
      ? { lyrics: extras.lyrics }
      : {}),
  }
}

/** The subset of a browser `WebSocket` the connection drives. */
export type MusicAssistantSocket = {
  addEventListener: (
    type: "open" | "message" | "close" | "error",
    listener: (event: { data?: unknown }) => void,
  ) => void
  send: (data: string) => void
  close: () => void
}

/** Music Assistant's WebSocket address for a configured server URL. */
export const readSocketUrl = (baseUrl: unknown) => {
  const url = new URL(sourceUrl({ baseUrl, path: "/ws" }))
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
  return url.toString()
}

/**
 * One authenticated Music Assistant WebSocket: request/response commands by
 * `message_id`, plus every server event. Reconnects with a bounded backoff,
 * and rejects every command still waiting when the socket drops.
 */
export const createMusicAssistantConnection = ({
  context,
  onReady,
  onEvent,
  onLoss,
  createSocket = (url) => new WebSocket(url),
  initialBackoffMs = 1000,
  maximumBackoffMs = 30000,
  commandTimeoutMs = 15000,
}: {
  context: SourceContext
  onReady: () => void
  onEvent: (event: RawRecord) => void
  onLoss: (error: string) => void
  createSocket?: (url: string) => MusicAssistantSocket
  initialBackoffMs?: number
  maximumBackoffMs?: number
  commandTimeoutMs?: number
}) => {
  const state = {
    isStopped: false,
    isAuthenticated: false,
    backoffMs: initialBackoffMs,
    nextMessageId: 1,
    socket: undefined as MusicAssistantSocket | undefined,
    timer: undefined as
      | ReturnType<typeof setTimeout>
      | undefined,
    pending: new Map<
      string,
      {
        resolve: (value: unknown) => void
        reject: (error: Error) => void
        timer: ReturnType<typeof setTimeout>
      }
    >(),
  }
  const getIsLive = () =>
    !state.isStopped && !context.signal.aborted
  const rejectPending = (message: string) => {
    state.pending.forEach((entry) => {
      clearTimeout(entry.timer)
      entry.reject(new Error(message))
    })
    state.pending.clear()
  }
  const sendRaw = ({
    command,
    args,
  }: {
    command: string
    args: Record<string, unknown>
  }) =>
    new Promise<unknown>((resolve, reject) => {
      const socket = state.socket
      if (!socket) {
        reject(new Error("Music Assistant is not connected."))
        return
      }
      const messageId = String(state.nextMessageId)
      state.nextMessageId += 1
      const timer = setTimeout(() => {
        state.pending.delete(messageId)
        reject(
          new Error(
            `Music Assistant did not answer ${command}.`,
          ),
        )
      }, commandTimeoutMs)
      timer.unref?.()
      state.pending.set(messageId, {
        resolve,
        reject,
        timer,
      })
      socket.send(
        JSON.stringify({
          message_id: messageId,
          command,
          args,
        }),
      )
    })
  const scheduleReconnect = () => {
    if (!getIsLive() || state.timer) {
      return
    }
    state.timer = setTimeout(() => {
      state.timer = undefined
      connect()
    }, state.backoffMs)
    state.timer.unref?.()
    state.backoffMs = Math.min(
      maximumBackoffMs,
      state.backoffMs * 2,
    )
  }
  const handleMessage = (data: unknown) => {
    if (typeof data !== "string") {
      return
    }
    const message = (() => {
      try {
        return record(JSON.parse(data))
      } catch {
        return {}
      }
    })()
    const messageId = textValue(message.message_id)
    const entry = messageId
      ? state.pending.get(messageId)
      : undefined
    if (entry) {
      state.pending.delete(messageId)
      clearTimeout(entry.timer)
      if (message.error_code !== undefined) {
        entry.reject(
          new Error(
            textValue(message.details) ||
              "Music Assistant refused the command.",
          ),
        )
        return
      }
      entry.resolve(message.result)
      return
    }
    if (typeof message.event === "string") {
      onEvent(message)
    }
  }
  const connect = () => {
    if (!getIsLive()) {
      return
    }
    const closed = { has: false }
    const handleLoss = (reason: string) => {
      if (closed.has) {
        return
      }
      closed.has = true
      state.socket = undefined
      state.isAuthenticated = false
      rejectPending(reason)
      if (getIsLive()) {
        onLoss(reason)
      }
      scheduleReconnect()
    }
    try {
      const socket = createSocket(
        readSocketUrl(context.source.settings.url),
      )
      state.socket = socket
      socket.addEventListener("open", () => {
        sendRaw({
          command: "auth",
          args: { token: context.secrets.token ?? "" },
        })
          .then(() => {
            state.isAuthenticated = true
            state.backoffMs = initialBackoffMs
            onReady()
          })
          .catch((error: unknown) => {
            handleLoss(
              `Music Assistant refused the token: ${error instanceof Error ? error.message : String(error)}`,
            )
            socket.close()
          })
      })
      socket.addEventListener("message", (event) =>
        handleMessage(event.data),
      )
      socket.addEventListener("close", () =>
        handleLoss("The Music Assistant connection closed."),
      )
      socket.addEventListener("error", () =>
        handleLoss("The Music Assistant connection failed."),
      )
    } catch (error) {
      handleLoss(
        error instanceof Error
          ? error.message
          : "The Music Assistant connection failed.",
      )
    }
  }
  context.signal.addEventListener("abort", () => {
    state.isStopped = true
  })
  return {
    start: connect,
    send: ({
      command,
      args = {},
    }: {
      command: string
      args?: Record<string, unknown>
    }) =>
      state.isAuthenticated
        ? sendRaw({ command, args })
        : Promise.reject(
            new Error("Music Assistant is not connected."),
          ),
    dispose: () => {
      state.isStopped = true
      if (state.timer) {
        clearTimeout(state.timer)
      }
      rejectPending("The Music Assistant source stopped.")
      state.socket?.close()
      state.socket = undefined
    },
  }
}

/** The file a queue row plays, which is what Music Assistant analyzes for a waveform. */
const readAnalysisTarget = (mediaItem: RawRecord) => {
  const mapping = record(
    (Array.isArray(mediaItem.provider_mappings)
      ? mediaItem.provider_mappings
      : []
    ).find(
      (entry) =>
        record(entry).available !== false &&
        textValue(record(entry).item_id),
    ),
  )
  const itemId = textValue(mapping.item_id)
  const provider =
    textValue(mapping.provider_instance) ||
    textValue(mapping.provider_domain)
  return itemId && provider
    ? { item_id: itemId, provider_instance_id_or_domain: provider }
    : undefined
}

const allowedActions = new Set([
  "play_pause",
  "next",
  "previous",
  "seek",
  "play_item",
  "set_volume",
  "shuffle",
  "repeat",
  "favorite",
  "set_member",
  "select_player",
])

/**
 * Music Assistant over its WebSocket API: the selected player, its queue
 * around the current track, the waveform and lyrics of that track, and the
 * controls Music Assistant itself offers for them. `createSocket` exists for
 * tests; the running source uses the platform `WebSocket`.
 */
export const buildMusicAssistantSource =
  ({
    createSocket,
  }: {
    createSocket?: (url: string) => MusicAssistantSocket
  } = {}): SourceFactory =>
  (context) => {
  const media = createSourceMedia(context)
  const baseUrl = context.source.settings.url
  const state = {
    players: new Map<string, RawRecord>(),
    queues: new Map<string, RawRecord>(),
    windows: new Map<
      string,
      {
        offset: number
        currentIndex: number | undefined
        items: unknown[]
      }
    >(),
    extras: new Map<
      string,
      {
        waveform?: number[]
        lyrics?: MusicPlayerData["lyrics"]
      }
    >(),
    pendingExtras: new Set<string>(),
    channelQueues: new Map<
      string,
      { playerId: string; key: string; queueId?: string }
    >(),
    manualPlayerIds: new Map<string, string>(),
    publishTimer: undefined as
      | ReturnType<typeof setTimeout>
      | undefined,
    refreshTimer: undefined as
      | ReturnType<typeof setTimeout>
      | undefined,
  }
  const channelPlayerIds = (channelId: string) =>
    stringList(
      context.channels.find(
        (channel) => channel.id === channelId,
      )?.settings.playerIds,
    )
  const reportAll = (error: string) =>
    context.channels.forEach((channel) => {
      context.reportError({ channelId: channel.id, error })
    })
  const chosenPlayerId = (channelId: string) =>
    choosePlayerId({
      playerIds: channelPlayerIds(channelId),
      players: state.players,
      manualPlayerId: state.manualPlayerIds.get(channelId),
    })
  const currentMediaItem = (queueId: string) => {
    const queueWindow = state.windows.get(queueId)
    const currentIndex = finiteNumber(
      state.queues.get(queueId)?.current_index,
    )
    return record(
      record(
        queueWindow?.items.find(
          (item, position) =>
            (finiteNumber(record(item).index) ??
              queueWindow.offset + position) === currentIndex,
        ),
      ).media_item,
    )
  }
  const snapshot = (channelId: string) => {
    const queueId =
      state.channelQueues.get(channelId)?.queueId
    const mediaUri = queueId
      ? textValue(currentMediaItem(queueId).uri)
      : ""
    return buildMusicPlayerData({
      playerIds: channelPlayerIds(channelId),
      players: state.players,
      manualPlayerId: state.manualPlayerIds.get(channelId),
      queue: queueId ? state.queues.get(queueId) : undefined,
      queueWindow: queueId
        ? state.windows.get(queueId)
        : undefined,
      extras: mediaUri
        ? state.extras.get(mediaUri)
        : undefined,
      baseUrl,
    })
  }
  const publishNow = () => {
    state.publishTimer = undefined
    context.channels.forEach((channel) => {
      context.publish({
        channelId: channel.id,
        data: media.rewrite({
          channelId: channel.id,
          data: snapshot(channel.id),
        }),
      })
    })
  }
  // Coalesce a burst of events into one publish per channel.
  const schedulePublish = () => {
    if (state.publishTimer) {
      return
    }
    state.publishTimer = setTimeout(publishNow, 100)
    state.publishTimer.unref?.()
  }
  const connection = createMusicAssistantConnection({
    context,
    onReady: () => {
      void refreshAll()
    },
    onEvent: (event) => handleEvent(event),
    onLoss: reportAll,
    ...(createSocket ? { createSocket } : {}),
  })
  const loadWindow = async (queueId: string) => {
    const currentIndex = finiteNumber(
      state.queues.get(queueId)?.current_index,
    )
    const offset = Math.max(
      0,
      (currentIndex ?? 0) - PLAYED_ROW_COUNT,
    )
    const items = await connection.send({
      command: "player_queues/items",
      args: {
        queue_id: queueId,
        limit: PLAYED_ROW_COUNT + 1 + UPCOMING_ROW_COUNT,
        offset,
      },
    })
    state.windows.set(queueId, {
      offset,
      currentIndex,
      items: Array.isArray(items) ? items : [],
    })
  }
  const loadExtras = async (queueId: string) => {
    const mediaItem = currentMediaItem(queueId)
    const mediaUri = textValue(mediaItem.uri)
    if (
      !mediaUri ||
      state.extras.has(mediaUri) ||
      state.pendingExtras.has(mediaUri)
    ) {
      return
    }
    state.pendingExtras.add(mediaUri)
    const target = readAnalysisTarget(mediaItem)
    const [waveform, lyrics] = await Promise.all([
      target
        ? connection
            .send({
              command: "audio_analysis/wave_form",
              args: target,
            })
            .then((values) =>
              downsampleWaveform({ values }),
            )
            .catch(() => undefined)
        : undefined,
      mediaItem.media_type === "track"
        ? connection
            .send({
              command: "metadata/get_track_lyrics",
              args: { track: mediaItem },
            })
            .then(normalizeLyrics)
            .catch(() => undefined)
        : undefined,
    ])
    state.pendingExtras.delete(mediaUri)
    // Keep the cache to the tracks still on screen somewhere.
    const visibleUris = new Set(
      [...state.queues.keys()].map((id) =>
        textValue(currentMediaItem(id).uri),
      ),
    )
    ;[...state.extras.keys()].forEach((uri) => {
      if (!visibleUris.has(uri)) {
        state.extras.delete(uri)
      }
    })
    state.extras.set(mediaUri, {
      ...(waveform ? { waveform } : {}),
      ...(lyrics ? { lyrics } : {}),
    })
    schedulePublish()
  }
  /** Resolve which queue each channel's chosen player plays, then load what it needs. */
  const syncChannels = async () => {
    await Promise.all(
      context.channels.map(async (channel) => {
        const playerId = chosenPlayerId(channel.id)
        if (!playerId) {
          state.channelQueues.delete(channel.id)
          return
        }
        const player = state.players.get(playerId) ?? {}
        const key = [
          playerId,
          textValue(player.active_source),
          textValue(player.active_group),
          textValue(player.synced_to),
        ].join("|")
        const previous = state.channelQueues.get(channel.id)
        if (previous?.key !== key) {
          const queue = record(
            await connection.send({
              command: "player_queues/get_active_queue",
              args: { player_id: playerId },
            }),
          )
          const queueId = textValue(queue.queue_id)
          if (queueId) {
            state.queues.set(queueId, queue)
          }
          state.channelQueues.set(channel.id, {
            playerId,
            key,
            ...(queueId ? { queueId } : {}),
          })
        }
        const queueId =
          state.channelQueues.get(channel.id)?.queueId
        if (!queueId) {
          return
        }
        const queueWindow = state.windows.get(queueId)
        if (
          !queueWindow ||
          queueWindow.currentIndex !==
            finiteNumber(
              state.queues.get(queueId)?.current_index,
            )
        ) {
          await loadWindow(queueId)
        }
        void loadExtras(queueId)
      }),
    )
    schedulePublish()
  }
  const refreshAll = async () => {
    try {
      const players = await connection.send({
        command: "players/all",
      })
      state.players = new Map(
        (Array.isArray(players) ? players : [])
          .map(record)
          .filter((player) => textValue(player.player_id))
          .map((player) => [
            textValue(player.player_id),
            player,
          ]),
      )
      state.channelQueues.clear()
      state.windows.clear()
      await syncChannels()
    } catch (error) {
      reportAll(
        error instanceof Error
          ? error.message
          : "Music Assistant could not be read.",
      )
    }
  }
  const scheduleSync = () => {
    if (state.refreshTimer) {
      return
    }
    state.refreshTimer = setTimeout(() => {
      state.refreshTimer = undefined
      syncChannels().catch((error: unknown) =>
        reportAll(
          error instanceof Error
            ? error.message
            : "Music Assistant could not be read.",
        ),
      )
    }, 250)
    state.refreshTimer.unref?.()
  }
  const watchedQueueIds = () =>
    new Set(
      [...state.channelQueues.values()].flatMap((entry) =>
        entry.queueId ? [entry.queueId] : [],
      ),
    )
  const handleEvent = (event: RawRecord) => {
    const objectId = textValue(event.object_id)
    const data = event.data
    switch (event.event) {
      case "player_updated": {
        const player = record(data)
        const playerId =
          textValue(player.player_id) || objectId
        if (playerId) {
          state.players.set(playerId, player)
          scheduleSync()
        }
        return
      }
      case "player_added":
      case "player_removed":
        void refreshAll()
        return
      case "queue_updated": {
        const queue = record(data)
        const queueId = textValue(queue.queue_id) || objectId
        if (queueId && watchedQueueIds().has(queueId)) {
          state.queues.set(queueId, queue)
          scheduleSync()
        }
        return
      }
      case "queue_items_updated":
        if (watchedQueueIds().has(objectId)) {
          state.windows.delete(objectId)
          scheduleSync()
        }
        return
      case "queue_time_updated": {
        const queue = state.queues.get(objectId)
        const elapsed = finiteNumber(data)
        if (!queue || elapsed === undefined) {
          return
        }
        const nowSeconds = Date.now() / 1000
        const lastElapsed =
          finiteNumber(queue.elapsed_time) ?? 0
        const lastUpdated =
          finiteNumber(queue.elapsed_time_last_updated) ??
          nowSeconds
        const isPlaying =
          textValue(queue.state) === "playing"
        const expected = isPlaying
          ? lastElapsed + (nowSeconds - lastUpdated)
          : lastElapsed
        state.queues.set(objectId, {
          ...queue,
          elapsed_time: elapsed,
          elapsed_time_last_updated: nowSeconds,
        })
        if (
          Math.abs(expected - elapsed) >=
          POSITION_JUMP_SECONDS
        ) {
          schedulePublish()
        }
        return
      }
      default:
        return
    }
  }
  const readTarget = (channelId: string) => {
    const playerId = chosenPlayerId(channelId)
    const player = playerId
      ? state.players.get(playerId)
      : undefined
    const queueId =
      state.channelQueues.get(channelId)?.queueId
    if (!playerId || !player) {
      throw new Error("No music player is available.")
    }
    return { playerId, player, queueId }
  }
  const requireQueue = (queueId: string | undefined) => {
    if (!queueId) {
      throw new Error("This player has no queue.")
    }
    return queueId
  }
  const execute = async ({
    channelId,
    action,
    payload,
  }: {
    channelId: string
    action: string
    payload: Record<string, unknown>
  }) => {
    const { playerId, player, queueId } =
      readTarget(channelId)
    switch (action) {
      case "play_pause":
      case "next":
      case "previous":
        return connection.send({
          command: `player_queues/${action}`,
          args: { queue_id: requireQueue(queueId) },
        })
      case "seek": {
        const position = finiteNumber(
          payload.positionSeconds,
        )
        const duration = snapshot(channelId).current
          ?.durationSeconds
        if (
          position === undefined ||
          position < 0 ||
          (duration !== undefined && position > duration)
        ) {
          throw new Error(
            "The seek position is outside the track.",
          )
        }
        return connection.send({
          command: "player_queues/seek",
          args: {
            queue_id: requireQueue(queueId),
            position: Math.round(position),
          },
        })
      }
      case "play_item": {
        const queueItemId = textValue(payload.queueItemId)
        const isListed = snapshot(channelId).queue?.items.some(
          (item) => item.queueItemId === queueItemId,
        )
        if (!queueItemId || !isListed) {
          throw new Error(
            "That track is not in the visible queue.",
          )
        }
        return connection.send({
          command: "player_queues/play_index",
          args: {
            queue_id: requireQueue(queueId),
            index: queueItemId,
          },
        })
      }
      case "set_volume": {
        const volume = finiteNumber(payload.volume)
        if (volume === undefined || volume < 0 || volume > 100) {
          throw new Error(
            "The volume must be from 0 to 100.",
          )
        }
        return readIsGroup(player)
          ? connection.send({
              command: "players/cmd/group_volume",
              args: {
                player_id: playerId,
                volume_level: Math.round(volume),
              },
            })
          : connection.send({
              command: "players/cmd/volume_set",
              args: {
                player_id: playerId,
                volume_level: Math.round(volume),
              },
            })
      }
      case "shuffle":
        if (typeof payload.isEnabled !== "boolean") {
          throw new Error("Shuffle needs on or off.")
        }
        return connection.send({
          command: "player_queues/shuffle",
          args: {
            queue_id: requireQueue(queueId),
            shuffle_enabled: payload.isEnabled,
          },
        })
      case "repeat": {
        const mode = textValue(payload.mode)
        if (!repeatModes.has(mode)) {
          throw new Error("Repeat must be off, one, or all.")
        }
        return connection.send({
          command: "player_queues/repeat",
          args: {
            queue_id: requireQueue(queueId),
            repeat_mode: mode,
          },
        })
      }
      case "favorite": {
        const mediaItem = currentMediaItem(
          requireQueue(queueId),
        )
        const uri = textValue(mediaItem.uri)
        if (!uri || typeof payload.isFavorite !== "boolean") {
          throw new Error("There is no track to favorite.")
        }
        if (payload.isFavorite) {
          return connection.send({
            command: "music/favorites/add_item",
            args: { item: uri },
          })
        }
        if (mediaItem.provider !== "library") {
          throw new Error(
            "Only a library track can be removed from favorites.",
          )
        }
        return connection.send({
          command: "music/favorites/remove_item",
          args: {
            media_type: textValue(mediaItem.media_type),
            library_item_id: textValue(mediaItem.item_id),
          },
        })
      }
      case "set_member": {
        const memberId = textValue(payload.playerId)
        const data = snapshot(channelId).player
        const member = data?.members.find(
          (entry) => entry.id === memberId,
        )
        if (
          !data?.isMemberControlAvailable ||
          !member ||
          typeof payload.isMember !== "boolean"
        ) {
          throw new Error(
            "That speaker cannot be synced with this player.",
          )
        }
        return connection.send({
          command: "players/cmd/set_members",
          args: {
            target_player: playerId,
            ...(payload.isMember
              ? { player_ids_to_add: [memberId] }
              : { player_ids_to_remove: [memberId] }),
          },
        })
      }
      default:
        throw new Error("Unknown music action.")
    }
  }
  return {
    start: connection.start,
    dispose: () => {
      if (state.publishTimer) {
        clearTimeout(state.publishTimer)
      }
      if (state.refreshTimer) {
        clearTimeout(state.refreshTimer)
      }
      connection.dispose()
    },
    getMedia: media.getMedia,
    discover: async () => {
      const players = await connection.send({
        command: "players/all",
      })
      return {
        players: (Array.isArray(players) ? players : [])
          .map(record)
          .filter(
            (player) =>
              textValue(player.player_id) &&
              player.enabled !== false,
          )
          .map((player) => ({
            id: textValue(player.player_id),
            name: readPlayerName(player),
          })),
      }
    },
    executeAction: async ({ channelId, action, payload }) => {
      if (
        !context.channels.some(
          (channel) => channel.id === channelId,
        )
      ) {
        throw new Error("Unknown channel.")
      }
      if (!allowedActions.has(action)) {
        throw new Error("Unknown music action.")
      }
      if (action === "select_player") {
        const playerId = textValue(payload.playerId)
        if (playerId === "automatic") {
          state.manualPlayerIds.delete(channelId)
        } else if (
          channelPlayerIds(channelId).includes(playerId)
        ) {
          state.manualPlayerIds.set(channelId, playerId)
        } else {
          throw new Error(
            "That player is not part of this channel.",
          )
        }
        await syncChannels()
        return { ok: true }
      }
      return execute({ channelId, action, payload })
    },
  }
}
/** The Music Assistant source as the platform registers it. */
export const createMusicAssistantSource =
  buildMusicAssistantSource()
