import {
  builtinContractSchemas,
  type ChannelDefinition,
  type ChannelSnapshot,
} from "@castkit/sdk/contracts"

type ContractParser = { parse: (data: unknown) => unknown }
/** Validates every update and fans out source-independent channel snapshots. */
export const createChannelHub = ({
  contracts = new Map<string, ContractParser>(
    Object.entries(builtinContractSchemas),
  ),
  now = () => Date.now(),
}: {
  contracts?: Map<string, ContractParser>
  now?: () => number
} = {}) => {
  const definitions = new Map<string, ChannelDefinition>()
  const snapshots = new Map<string, ChannelSnapshot>()
  const listeners = new Set<
    (snapshot: ChannelSnapshot) => void
  >()
  const emit = (snapshot: ChannelSnapshot) => {
    snapshots.set(snapshot.id, structuredClone(snapshot))
    listeners.forEach((listener) => {
      try {
        listener(structuredClone(snapshot))
      } catch {
        /* One subscriber must not stop others. */
      }
    })
  }
  const configure = (channels: ChannelDefinition[]) => {
    if (
      new Set(channels.map((channel) => channel.id))
        .size !== channels.length
    ) {
      throw new Error("Duplicate channel ID.")
    }
    const previous = new Map(definitions)
    definitions.clear()
    channels.forEach((channel) => {
      definitions.set(channel.id, structuredClone(channel))
      if (
        JSON.stringify(previous.get(channel.id)) !==
        JSON.stringify(channel)
      ) {
        emit({
          id: channel.id,
          type: channel.type,
          data: null,
          status: contracts.has(channel.type)
            ? "waiting"
            : "error",
          ...(!contracts.has(channel.type)
            ? {
                error:
                  "This channel's plugin is unavailable.",
              }
            : {}),
        })
      }
    })
    Array.from(snapshots.keys())
      .filter((id) => !definitions.has(id))
      .forEach((id) => {
        snapshots.delete(id)
      })
  }
  const setStatus = ({
    channelId,
    status,
    error,
  }: {
    channelId: string
    status: ChannelSnapshot["status"]
    error?: string
  }) => {
    const snapshot = snapshots.get(channelId)
    if (snapshot) {
      const { error: _previousError, ...rest } = snapshot
      emit({ ...rest, status, ...(error ? { error } : {}) })
    }
  }
  const publish = ({
    channelId,
    data,
  }: {
    channelId: string
    data: unknown
  }) => {
    const channel = definitions.get(channelId)
    if (!channel) {
      return
    }
    try {
      const contract = contracts.get(channel.type)
      if (!contract)
        throw new Error("Channel plugin is unavailable")
      const parsed = contract.parse(data)
      emit({
        id: channelId,
        type: channel.type,
        data: parsed,
        status: "ready",
        updatedAt: new Date(now()).toISOString(),
      })
    } catch {
      setStatus({
        channelId,
        status: "error",
        error:
          "The source sent data that does not match this channel's contract.",
      })
    }
  }
  const staleTimer = setInterval(() => {
    definitions.forEach((channel) => {
      const maximumAge =
        typeof channel.settings.staleAfterSeconds ===
        "number"
          ? channel.settings.staleAfterSeconds
          : channel.type === "images.v1"
            ? 7200
            : 300
      const snapshot = snapshots.get(channel.id)
      if (
        maximumAge > 0 &&
        snapshot?.status === "ready" &&
        snapshot.updatedAt &&
        now() - Date.parse(snapshot.updatedAt) >
          maximumAge * 1000
      ) {
        setStatus({
          channelId: channel.id,
          status: "stale",
        })
      }
    })
  }, 1000)
  staleTimer.unref()
  return {
    configure,
    publish,
    setStatus,
    get: (id: string) => {
      const snapshot = snapshots.get(id)
      return snapshot
        ? structuredClone(snapshot)
        : undefined
    },
    list: () =>
      Array.from(snapshots.values()).map((snapshot) =>
        structuredClone(snapshot),
      ),
    subscribe: (
      listener: (snapshot: ChannelSnapshot) => void,
    ) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    dispose: () => {
      clearInterval(staleTimer)
      listeners.clear()
      snapshots.clear()
      definitions.clear()
    },
  }
}
/** Shared channel hub interface used by source adapters and HTTP transports. */
export type ChannelHub = ReturnType<typeof createChannelHub>
