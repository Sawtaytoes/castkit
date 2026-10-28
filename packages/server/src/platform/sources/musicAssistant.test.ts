import { expect, test, vi } from "vitest"
import { sourceContext } from "./__fixtures__/sourceContext.ts"
import {
  buildMusicAssistantSource,
  choosePlayerId,
  downsampleWaveform,
  type MusicAssistantSocket,
  normalizeLyrics,
  normalizeQueueItem,
  parseLrcLyrics,
  readArtworkUrl,
  readSocketUrl,
} from "./musicAssistant.ts"

const PROXY_ID = "a".repeat(64)

const mediaItem = (title: string, itemId: string) => ({
  item_id: itemId,
  provider: "library",
  uri: `library://track/${itemId}`,
  media_type: "track",
  name: title,
  duration: 200,
  favorite: itemId === "12",
  artists: [{ name: "Sample Artist" }],
  album: { name: "Sample Album" },
  image: { proxy_id: PROXY_ID },
  provider_mappings: [
    {
      item_id: `Sample Artist/${title}.flac`,
      provider_instance: "files--1",
      available: true,
    },
  ],
})

const queueRow = (index: number) => ({
  queue_item_id: `row-${index}`,
  // Music Assistant sends 0 here on every row; the position is the page offset.
  index: 0,
  sort_index: index,
  name: `Sample Artist - Song ${index}`,
  duration: 200,
  available: true,
  image: { proxy_id: PROXY_ID },
  media_item: mediaItem(`Song ${index}`, String(index)),
})

const PLAYERS = [
  {
    player_id: "group-1",
    name: "Desk Group",
    type: "group",
    available: true,
    enabled: true,
    playback_state: "playing",
    group_volume: 40,
    group_volume_muted: false,
    group_members: ["speaker-1"],
    static_group_members: ["speaker-1", "speaker-2"],
    supported_features: ["volume_set"],
    active_source: "group-1",
  },
  {
    player_id: "speaker-1",
    name: "Desk Speaker",
    type: "player",
    available: true,
    enabled: true,
    playback_state: "idle",
    volume_level: 30,
    volume_muted: false,
    group_members: [],
    can_group_with: ["speaker-2"],
    supported_features: ["volume_set", "set_members"],
  },
  {
    player_id: "speaker-2",
    name: "Shelf Speaker",
    type: "player",
    available: false,
    enabled: true,
    playback_state: "idle",
    volume_level: 20,
    group_members: [],
    can_group_with: ["speaker-1"],
    supported_features: ["volume_set", "set_members"],
  },
]

const QUEUE = {
  queue_id: "group-1",
  items: 120,
  current_index: 12,
  shuffle_enabled: false,
  repeat_mode: "all",
  elapsed_time: 30,
  elapsed_time_last_updated: 1_700_000_000,
  state: "playing",
}

/** A Music Assistant server in memory: answers commands and records them. */
const createFakeServer = ({
  responses = {},
}: {
  responses?: Record<
    string,
    (args: Record<string, unknown>) => unknown
  >
} = {}) => {
  const sent: {
    command: string
    args: Record<string, unknown>
  }[] = []
  const listeners = new Map<
    string,
    ((event: { data?: unknown }) => void)[]
  >()
  const emit = (type: string, data?: unknown) =>
    (listeners.get(type) ?? []).forEach((listener) => {
      listener({ data })
    })
  const answers: Record<
    string,
    (args: Record<string, unknown>) => unknown
  > = {
    auth: () => ({ authenticated: true }),
    "players/all": () => PLAYERS,
    "player_queues/get_active_queue": () => QUEUE,
    "player_queues/items": (args) =>
      Array.from({ length: 44 }, (_, position) =>
        queueRow(Number(args.offset) + position),
      ),
    "audio_analysis/wave_form": () =>
      Array.from({ length: 1800 }, (_, position) =>
        position === 900 ? 1 : 0.25,
      ),
    "metadata/get_track_lyrics": () => [
      "plain line",
      "[00:01.50]First line\n[00:04.00]Second line",
    ],
    ...responses,
  }
  const socket: MusicAssistantSocket = {
    addEventListener: (type, listener) => {
      listeners.set(
        type,
        (listeners.get(type) ?? []).concat(listener),
      )
    },
    send: (data) => {
      const message = JSON.parse(data) as {
        message_id: string
        command: string
        args: Record<string, unknown>
      }
      sent.push({
        command: message.command,
        args: message.args,
      })
      const answer =
        answers[message.command] ??
        (/^(player_queues|players\/cmd)\//.test(
          message.command,
        )
          ? () => null
          : undefined)
      queueMicrotask(() =>
        emit(
          "message",
          JSON.stringify(
            answer
              ? {
                  message_id: message.message_id,
                  result: answer(message.args) ?? null,
                }
              : {
                  message_id: message.message_id,
                  error_code: 1,
                  details: "Invalid command",
                },
          ),
        ),
      )
    },
    close: () => emit("close"),
  }
  return {
    sent,
    socket,
    open: () => emit("open"),
    event: (event: Record<string, unknown>) =>
      emit("message", JSON.stringify(event)),
  }
}

const startSource = async ({
  server = createFakeServer(),
  playerIds = ["group-1", "speaker-1"],
}: {
  server?: ReturnType<typeof createFakeServer>
  playerIds?: string[]
} = {}) => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout"],
  })
  const context = sourceContext({
    source: {
      id: "music",
      name: "Music",
      adapter: "music-assistant",
      settings: { url: "https://music.example" },
      isEnabled: true,
    },
    channels: [
      {
        id: "desk-music",
        name: "Desk music",
        sourceId: "music",
        type: "music-player.v1",
        settings: { playerIds },
      },
    ],
  })
  const source = buildMusicAssistantSource({
    createSocket: () => server.socket,
  })(context)
  await source.start?.()
  server.open()
  await vi.runAllTimersAsync()
  vi.useRealTimers()
  const latest = () =>
    vi.mocked(context.publish).mock.calls.at(-1)?.[0] as
      | { channelId: string; data: Record<string, unknown> }
      | undefined
  return { context, source, server, latest }
}

test("reduces a loudness curve to peaks so a short hit survives", () => {
  expect(
    downsampleWaveform({
      values: [0.1, 0.9, 0.2, 0.2, 0.3, 0.1],
      binCount: 3,
    }),
  ).toEqual([0.9, 0.2, 0.3])
})

test("clamps waveform values and returns nothing for an empty curve", () => {
  expect(
    downsampleWaveform({ values: [2, -1], binCount: 5 }),
  ).toEqual([1, 0])
  expect(downsampleWaveform({ values: null })).toBe(
    undefined,
  )
})

test("parses LRC time tags, repeats, and drops metadata tags", () => {
  expect(
    parseLrcLyrics(
      "[ar:Someone]\n[00:12.50]Hello\n[01:02.00][00:05.25]Chorus",
    ),
  ).toEqual([
    { startSeconds: 5.25, text: "Chorus" },
    { startSeconds: 12.5, text: "Hello" },
    { startSeconds: 62, text: "Chorus" },
  ])
})

test("prefers synced lyrics and falls back to plain lines without times", () => {
  expect(
    normalizeLyrics(["plain", "[00:01.00]Synced"]),
  ).toEqual({
    isSynced: true,
    lines: [{ startSeconds: 1, text: "Synced" }],
  })
  expect(normalizeLyrics(["one\ntwo", null])).toEqual({
    isSynced: false,
    lines: [{ text: "one" }, { text: "two" }],
  })
  expect(normalizeLyrics([null, null])).toBe(undefined)
})

test("chooses a person's pick, then a playing player, then a paused one", () => {
  const players = new Map(
    [
      { player_id: "a", playback_state: "idle" },
      { player_id: "b", playback_state: "paused" },
      { player_id: "c", playback_state: "playing" },
    ].map((player) => [player.player_id, player]),
  )
  expect(
    choosePlayerId({
      playerIds: ["a", "b", "c"],
      players,
      manualPlayerId: undefined,
    }),
  ).toBe("c")
  expect(
    choosePlayerId({
      playerIds: ["a", "b"],
      players,
      manualPlayerId: undefined,
    }),
  ).toBe("b")
  expect(
    choosePlayerId({
      playerIds: ["a", "b", "c"],
      players,
      manualPlayerId: "a",
    }),
  ).toBe("a")
  expect(
    choosePlayerId({
      playerIds: ["a", "b", "c"],
      players,
      manualPlayerId: "not-listed",
    }),
  ).toBe("c")
})

test("builds artwork addresses only from a well-formed proxy id on the source origin", () => {
  expect(
    readArtworkUrl({
      image: { proxy_id: PROXY_ID },
      baseUrl: "https://music.example/",
    }),
  ).toBe(
    `https://music.example/imageproxy/${PROXY_ID}?size=256`,
  )
  expect(
    readArtworkUrl({
      image: { proxy_id: "../escape" },
      baseUrl: "https://music.example",
    }),
  ).toBe(undefined)
})

test("splits a stream row's display name when it has no media item", () => {
  expect(
    normalizeQueueItem({
      item: {
        queue_item_id: "radio",
        name: "A Band - A Song",
        available: true,
      },
      queueIndex: 4,
      baseUrl: "https://music.example",
    }),
  ).toEqual({
    queueItemId: "radio",
    index: 4,
    title: "A Song",
    artist: "A Band",
    isAvailable: true,
  })
})

test("derives the WebSocket address from the service URL", () => {
  expect(readSocketUrl("https://music.example/")).toBe(
    "wss://music.example/ws",
  )
  expect(readSocketUrl("http://music.example:8095")).toBe(
    "ws://music.example:8095/ws",
  )
})

test("authenticates with the token and publishes the playing player's queue window", async () => {
  const { server, latest } = await startSource()
  expect(server.sent[0]).toEqual({
    command: "auth",
    args: { token: "test-token" },
  })
  expect(server.sent).toContainEqual({
    command: "player_queues/items",
    args: { queue_id: "group-1", limit: 44, offset: 9 },
  })
  const data = latest()?.data as {
    player: Record<string, unknown>
    queue: {
      items: { queueItemId: string; artworkPath?: string }[]
    }
    current: Record<string, unknown>
    waveform: number[]
    lyrics: unknown
    positionSeconds: number
    positionUpdatedAtMs: number
    isAutomaticSelection: boolean
  }
  expect(data.player).toMatchObject({
    id: "group-1",
    name: "Desk Group",
    state: "playing",
    volume: 40,
    isGroup: true,
    isMemberControlAvailable: false,
    members: [
      {
        id: "speaker-1",
        name: "Desk Speaker",
        isMember: true,
        isAvailable: true,
      },
      {
        id: "speaker-2",
        name: "Shelf Speaker",
        isMember: false,
        isAvailable: false,
      },
    ],
  })
  expect(data.queue.items[0]?.queueItemId).toBe("row-9")
  expect(data.queue.items[0]?.artworkPath).toMatch(
    /^\/api\/platform\/channels\/desk-music\/media\//,
  )
  expect(data.current).toMatchObject({
    queueItemId: "row-12",
    title: "Song 12",
    artist: "Sample Artist",
    album: "Sample Album",
    isFavorite: true,
  })
  expect(data.waveform).toHaveLength(300)
  expect(Math.max(...data.waveform)).toBe(1)
  expect(data.lyrics).toEqual({
    isSynced: true,
    lines: [
      { startSeconds: 1.5, text: "First line" },
      { startSeconds: 4, text: "Second line" },
    ],
  })
  expect(data.positionSeconds).toBe(30)
  expect(data.positionUpdatedAtMs).toBe(1_700_000_000_000)
  expect(data.isAutomaticSelection).toBe(true)
  expect(server.sent).toContainEqual({
    command: "audio_analysis/wave_form",
    args: {
      item_id: "Sample Artist/Song 12.flac",
      provider_instance_id_or_domain: "files--1",
    },
  })
})

test("plays a visible queue row by its id and refuses one it never showed", async () => {
  const { server, source } = await startSource()
  await source.executeAction?.({
    channelId: "desk-music",
    action: "play_item",
    payload: { queueItemId: "row-20" },
  })
  expect(server.sent.at(-1)).toEqual({
    command: "player_queues/play_index",
    args: { queue_id: "group-1", index: "row-20" },
  })
  await expect(
    source.executeAction?.({
      channelId: "desk-music",
      action: "play_item",
      payload: { queueItemId: "row-999" },
    }),
  ).rejects.toThrow("not in the visible queue")
})

test("sets a group's volume through the group command", async () => {
  const { server, source } = await startSource()
  await source.executeAction?.({
    channelId: "desk-music",
    action: "set_volume",
    payload: { volume: 55.4 },
  })
  expect(server.sent.at(-1)).toEqual({
    command: "players/cmd/group_volume",
    args: { player_id: "group-1", volume_level: 55 },
  })
  await expect(
    source.executeAction?.({
      channelId: "desk-music",
      action: "set_volume",
      payload: { volume: 140 },
    }),
  ).rejects.toThrow("from 0 to 100")
})

test("refuses a seek outside the track", async () => {
  const { source } = await startSource()
  await expect(
    source.executeAction?.({
      channelId: "desk-music",
      action: "seek",
      payload: { positionSeconds: 900 },
    }),
  ).rejects.toThrow("outside the track")
})

test("refuses to sync speakers on a player that cannot group, and syncs on one that can", async () => {
  const server = createFakeServer({
    responses: {
      "players/all": () =>
        PLAYERS.map((player) => ({
          ...player,
          playback_state:
            player.player_id === "speaker-1"
              ? "playing"
              : "idle",
        })),
    },
  })
  const { source } = await startSource({
    server,
    playerIds: ["speaker-1", "group-1"],
  })
  await source.executeAction?.({
    channelId: "desk-music",
    action: "set_member",
    payload: { playerId: "speaker-2", isMember: true },
  })
  expect(server.sent.at(-1)).toEqual({
    command: "players/cmd/set_members",
    args: {
      target_player: "speaker-1",
      player_ids_to_add: ["speaker-2"],
    },
  })
  await source.executeAction?.({
    channelId: "desk-music",
    action: "select_player",
    payload: { playerId: "group-1" },
  })
  await expect(
    source.executeAction?.({
      channelId: "desk-music",
      action: "set_member",
      payload: { playerId: "speaker-2", isMember: true },
    }),
  ).rejects.toThrow("cannot be synced")
})

test("keeps a person's player choice until they return to automatic", async () => {
  const { context, source } = await startSource()
  await source.executeAction?.({
    channelId: "desk-music",
    action: "select_player",
    payload: { playerId: "speaker-1" },
  })
  await new Promise((resolve) => setTimeout(resolve, 150))
  const chosen = vi
    .mocked(context.publish)
    .mock.calls.at(-1)?.[0] as {
    data: {
      player: { id: string }
      isAutomaticSelection: boolean
    }
  }
  expect(chosen.data.player.id).toBe("speaker-1")
  expect(chosen.data.isAutomaticSelection).toBe(false)
  await expect(
    source.executeAction?.({
      channelId: "desk-music",
      action: "select_player",
      payload: { playerId: "somewhere-else" },
    }),
  ).rejects.toThrow("not part of this channel")
})

test("asks again for a queue Music Assistant did not have, and plays a queueless player through its own command", async () => {
  const lookups = { count: 0 }
  const server = createFakeServer({
    responses: {
      "player_queues/get_active_queue": () => {
        lookups.count += 1
        return lookups.count === 1 ? null : QUEUE
      },
    },
  })
  const { source } = await startSource({ server })
  await source.executeAction?.({
    channelId: "desk-music",
    action: "play_pause",
    payload: {},
  })
  expect(server.sent.at(-1)).toEqual({
    command: "players/cmd/play_pause",
    args: { player_id: "group-1" },
  })
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout"],
  })
  server.event({
    event: "player_updated",
    object_id: "group-1",
    data: PLAYERS[0],
  })
  await vi.runAllTimersAsync()
  vi.useRealTimers()
  expect(lookups.count).toBe(2)
  await source.executeAction?.({
    channelId: "desk-music",
    action: "play_pause",
    payload: {},
  })
  expect(server.sent.at(-1)).toEqual({
    command: "player_queues/play_pause",
    args: { queue_id: "group-1" },
  })
})

test("seeks a playing queue without pausing it", async () => {
  const { server, source } = await startSource()
  await source.executeAction?.({
    channelId: "desk-music",
    action: "seek",
    payload: { positionSeconds: 60 },
  })
  expect(server.sent.at(-1)).toEqual({
    command: "player_queues/seek",
    args: { queue_id: "group-1", position: 60 },
  })
})

test("seeks a paused queue and pauses it again so the seek does not start playback", async () => {
  const server = createFakeServer({
    responses: {
      "players/all": () =>
        PLAYERS.map((player) => ({
          ...player,
          playback_state:
            player.player_id === "group-1"
              ? "paused"
              : player.playback_state,
        })),
      "player_queues/get_active_queue": () => ({
        ...QUEUE,
        state: "paused",
      }),
    },
  })
  const { source } = await startSource({ server })
  await source.executeAction?.({
    channelId: "desk-music",
    action: "seek",
    payload: { positionSeconds: 60 },
  })
  expect(server.sent.slice(-2)).toEqual([
    {
      command: "player_queues/seek",
      args: { queue_id: "group-1", position: 60 },
    },
    {
      command: "player_queues/pause",
      args: { queue_id: "group-1" },
    },
  ])
})

test("rejects an action the source never advertised", async () => {
  const { source } = await startSource()
  await expect(
    source.executeAction?.({
      channelId: "desk-music",
      action: "players/cmd/power",
      payload: {},
    }),
  ).rejects.toThrow("Unknown music action")
})

test("republishes the position after a seek but not for ordinary ticks", async () => {
  const { context, server } = await startSource()
  const publishCount = vi.mocked(context.publish).mock.calls
    .length
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "Date"],
  })
  vi.setSystemTime(1_700_000_010_000)
  server.event({
    event: "queue_time_updated",
    object_id: "group-1",
    data: 40,
  })
  await vi.runAllTimersAsync()
  expect(vi.mocked(context.publish).mock.calls.length).toBe(
    publishCount,
  )
  server.event({
    event: "queue_time_updated",
    object_id: "group-1",
    data: 120,
  })
  await vi.runAllTimersAsync()
  vi.useRealTimers()
  const data = vi
    .mocked(context.publish)
    .mock.calls.at(-1)?.[0].data as {
    positionSeconds: number
  }
  expect(data.positionSeconds).toBe(120)
})

test("reports a refused token on every channel", async () => {
  const server = createFakeServer({
    responses: {
      auth: () => {
        throw new Error("unused")
      },
    },
  })
  const failing = {
    ...server,
    socket: {
      ...server.socket,
      send: (data: string) => {
        const message = JSON.parse(data) as {
          message_id: string
        }
        queueMicrotask(() =>
          server.event({
            message_id: message.message_id,
            error_code: 20,
            details: "Invalid token",
          }),
        )
      },
    },
  }
  const { context } = await startSource({ server: failing })
  expect(context.reportError).toHaveBeenCalledWith({
    channelId: "desk-music",
    error: expect.stringContaining("Invalid token"),
  })
})

test("retries missing waveform analysis on playback ticks without repeatedly fetching lyrics", async () => {
  const attempts = { count: 0 }
  const server = createFakeServer({
    responses: {
      "audio_analysis/wave_form": () => {
        attempts.count += 1
        return attempts.count === 1 ? null : [0.2, 1, 0.4]
      },
    },
  })
  const { source, latest } = await startSource({ server })
  expect(latest()?.data.waveform).toBeUndefined()
  expect(attempts.count).toBe(1)
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "Date"],
  })
  try {
    server.event({
      event: "queue_time_updated",
      object_id: "group-1",
      data: 31,
    })
    await vi.runAllTimersAsync()
    expect(attempts.count).toBe(1)
    vi.setSystemTime(Date.now() + 31_000)
    server.event({
      event: "queue_time_updated",
      object_id: "group-1",
      data: 62,
    })
    await vi.runAllTimersAsync()
    expect(latest()?.data.waveform).toEqual([0.2, 1, 0.4])
    expect(attempts.count).toBe(2)
    expect(
      server.sent.filter(
        (call) =>
          call.command === "metadata/get_track_lyrics",
      ),
    ).toHaveLength(1)
  } finally {
    source.dispose?.()
    vi.useRealTimers()
  }
})
