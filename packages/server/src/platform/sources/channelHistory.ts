import { randomUUID } from "node:crypto"
import { readFileSync, statSync } from "node:fs"
import { mkdir, rename, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import type {
  ChannelDefinition,
  ContractData,
} from "@castkit/sdk/contracts"

type Sample = { time: string; value: number | string }
type Entity =
  ContractData["entities.v1"]["entities"][number]
const MAX_ENTITIES_PER_CHANNEL = 100
const MAX_SAMPLES_PER_ENTITY = 2000
const MAX_CHANNELS = 100
const MAX_FILE_BYTES = 32 * 1024 * 1024
/** Numeric history starts with received channel values; it never claims a recorder backfill. */
export const createChannelHistory = ({
  file,
  now = () => Date.now(),
  reportError = () => {},
}: {
  file?: string
  now?: () => number
  reportError?: (message: string) => void
} = {}) => {
  const channels = new Map<string, Map<string, Sample[]>>()
  const state: {
    timer: ReturnType<typeof setTimeout> | undefined
    pending: Promise<void>
    isDisposed: boolean
  } = {
    timer: undefined,
    pending: Promise.resolve(),
    isDisposed: false,
  }
  if (file) {
    try {
      if (statSync(file).size > MAX_FILE_BYTES) {
        throw new Error(
          "History file exceeds the storage limit.",
        )
      }
      const saved = JSON.parse(
        readFileSync(file, "utf8"),
      ) as { version?: unknown; channels?: unknown }
      if (
        saved.version !== 1 ||
        !Array.isArray(saved.channels)
      ) {
        throw new Error("Invalid history document.")
      }
      saved.channels
        .slice(0, MAX_CHANNELS)
        .forEach((channel: unknown) => {
          if (
            typeof channel !== "object" ||
            channel === null
          ) {
            return
          }
          const entry = channel as {
            id?: unknown
            entities?: unknown
          }
          if (
            typeof entry.id !== "string" ||
            !Array.isArray(entry.entities)
          ) {
            return
          }
          const entities = new Map<string, Sample[]>()
          entry.entities
            .slice(0, MAX_ENTITIES_PER_CHANNEL)
            .forEach((entity: unknown) => {
              if (
                typeof entity !== "object" ||
                entity === null
              ) {
                return
              }
              const value = entity as {
                id?: unknown
                samples?: unknown
              }
              if (
                typeof value.id !== "string" ||
                !Array.isArray(value.samples)
              ) {
                return
              }
              const samples = value.samples
                .filter(
                  (sample): sample is Sample =>
                    typeof sample === "object" &&
                    sample !== null &&
                    typeof sample.time === "string" &&
                    Number.isFinite(
                      Date.parse(sample.time),
                    ) &&
                    ((typeof sample.value === "number" &&
                      Number.isFinite(sample.value)) ||
                      (typeof sample.value === "string" &&
                        sample.value.length <= 256)),
                )
                .filter(
                  (sample) =>
                    Date.parse(sample.time) >
                    now() - 168 * 3600000,
                )
                .slice(-MAX_SAMPLES_PER_ENTITY)
              entities.set(value.id, samples)
            })
          channels.set(entry.id, entities)
        })
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code !== "ENOENT"
      ) {
        reportError(
          "Stored channel history could not be read; live history will start with the next sample.",
        )
      }
    }
  }
  const flush = () => {
    if (!file) {
      return Promise.resolve()
    }
    const serialized = JSON.stringify({
      version: 1,
      channels: Array.from(channels, ([id, entities]) => ({
        id,
        entities: Array.from(
          entities,
          ([entityId, samples]) => ({
            id: entityId,
            samples,
          }),
        ),
      })),
    })
    state.pending = state.pending
      .then(async () => {
        if (
          Buffer.byteLength(serialized) > MAX_FILE_BYTES
        ) {
          throw new Error(
            "Channel history exceeded the storage limit.",
          )
        }
        await mkdir(dirname(file), { recursive: true })
        const temporary = `${file}.${randomUUID()}.pending`
        await writeFile(temporary, serialized, {
          mode: 0o600,
        })
        await rename(temporary, file)
      })
      .catch(() => {
        reportError(
          "Channel history could not be saved; current in-memory samples remain available.",
        )
      })
    return state.pending
  }
  const schedule = () => {
    if (!file || state.timer || state.isDisposed) {
      return
    }
    state.timer = setTimeout(() => {
      state.timer = undefined
      void flush()
    }, 5000)
    state.timer.unref()
  }
  const configure = (definitions: ChannelDefinition[]) => {
    const ids = new Set(
      definitions
        .filter(
          (channel) =>
            typeof channel.settings.historyHours ===
              "number" && channel.settings.historyHours > 0,
        )
        .map((channel) => channel.id),
    )
    Array.from(channels.keys())
      .filter((id) => !ids.has(id))
      .forEach((id) => {
        channels.delete(id)
      })
  }
  const append = ({
    channelId,
    entities,
    hours,
  }: {
    channelId: string
    entities: Entity[]
    hours: number
  }) => {
    const boundedHours = Math.max(0, Math.min(168, hours))
    if (!boundedHours || state.isDisposed) {
      return entities
    }
    if (
      !channels.has(channelId) &&
      channels.size >= MAX_CHANNELS
    ) {
      return entities
    }
    const histories =
      channels.get(channelId) ?? new Map<string, Sample[]>()
    const selected = new Set(
      entities.map((entity) => entity.id),
    )
    Array.from(histories.keys())
      .filter((id) => !selected.has(id))
      .forEach((id) => {
        histories.delete(id)
      })
    const cutoff = now() - boundedHours * 3600000
    const updated = entities.map((entity) => {
      const numericValue = Number(entity.state)
      if (
        !entity.state.trim() ||
        entity.state.length > 256
      ) {
        return entity
      }
      const value = Number.isFinite(numericValue)
        ? numericValue
        : entity.state
      if (
        !histories.has(entity.id) &&
        histories.size >= MAX_ENTITIES_PER_CHANNEL
      ) {
        return entity
      }
      const previous = histories.get(entity.id) ?? []
      const retained = previous.filter(
        (sample) => Date.parse(sample.time) >= cutoff,
      )
      const samples =
        retained.at(-1)?.value === value
          ? retained
          : retained
              .concat({
                time: new Date(now()).toISOString(),
                value,
              })
              .slice(-MAX_SAMPLES_PER_ENTITY)
      histories.set(entity.id, samples)
      return {
        ...entity,
        attributes: {
          ...entity.attributes,
          history: samples
            .filter(
              (sample) => typeof sample.value === "number",
            )
            .map((sample) => ({ ...sample })),
          stateHistory: samples.map((sample) => ({
            time: sample.time,
            state: String(sample.value),
          })),
        },
      }
    })
    channels.set(channelId, histories)
    const series = Array.from(channels.values()).flatMap(
      (entries) => Array.from(entries),
    )
    const totalSamples = series.reduce(
      (sum, [, samples]) => sum + samples.length,
      0,
    )
    if (totalSamples > 200000) {
      const perEntity = Math.max(
        1,
        Math.floor(200000 / series.length),
      )
      channels.forEach((entries) => {
        entries.forEach((samples, entityId) => {
          entries.set(entityId, samples.slice(-perEntity))
        })
      })
    }
    schedule()
    return updated
  }
  return {
    configure,
    append,
    flush,
    dispose: () => {
      state.isDisposed = true
      if (state.timer) {
        clearTimeout(state.timer)
      }
      void flush()
    },
  }
}
