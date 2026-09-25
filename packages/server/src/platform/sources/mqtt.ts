import { builtinContractSchemas } from "@castkit/sdk/contracts"
import type {
  SourceContext,
  SourceFactory,
} from "@castkit/sdk/plugin"
import {
  parseAgendaPayload,
  parseNowPlayingPayload,
  parsePrintersPayload,
  parseQueuePayload,
  parseWeatherPayload,
} from "@castkit/shared/viewData/parsers"
import { normalizeAiUsage } from "./aiUsage.ts"
import { finiteNumber, record, textValue } from "./http.ts"
import { createSourceMedia } from "./mediaAssets.ts"
import { normalizeRipDeck } from "./ripDeck.ts"

/** Canonical contracts also accept CastKit's existing MQTT producer payloads. */
export const normalizeMqttPayload = ({
  type,
  data,
}: {
  type: string
  data: unknown
}) => {
  const raw = record(data)
  if (
    type === "now-playing.v1" &&
    typeof raw.title === "string"
  ) {
    const parsed = parseNowPlayingPayload({
      ...raw,
      artwork: raw.artwork ?? raw.artworkPath,
      position: raw.position ?? raw.positionSeconds,
      positionUpdatedAt:
        raw.positionUpdatedAt ?? raw.positionUpdatedAtMs,
      duration: raw.duration ?? raw.durationSeconds,
    })
    const entityId =
      textValue(raw.entityId) || textValue(raw.entity_id)
    return { ...parsed, ...(entityId ? { entityId } : {}) }
  }
  const schema =
    builtinContractSchemas[
      type as keyof typeof builtinContractSchemas
    ]
  const canonical = schema?.safeParse(data)
  if (canonical?.success) {
    return canonical.data
  }
  if (
    type === "printers.v1" &&
    Array.isArray(raw.printers)
  ) {
    return parsePrintersPayload(data)
  }
  if (type === "agenda.v1" && Array.isArray(raw.events)) {
    return parseAgendaPayload(data)
  }
  if (type === "queue.v1" && Array.isArray(raw.items)) {
    return parseQueuePayload(data)
  }
  if (
    type === "weather.v1" &&
    typeof raw.temperature === "number"
  ) {
    return parseWeatherPayload(data)
  }
  if (type === "rip-deck.v1" && raw.ripDeck) {
    return normalizeRipDeck(data)
  }
  if (
    type === "ai-usage.v1" &&
    Array.isArray(raw.providers)
  ) {
    return normalizeAiUsage(data)
  }
  return data
}
const topicFor = ({
  context,
  channelId,
}: {
  context: SourceContext
  channelId: string
}) => {
  const channel = context.channels.find(
    (entry) => entry.id === channelId,
  )
  return (
    textValue(channel?.settings.topic) ||
    `${textValue(context.source.settings.topicPrefix) || "castkit/channels"}/${channelId}/set`
  )
}
/** Named MQTT channels never depend on a device identity. */
export const createMqttSource: SourceFactory = (
  context,
) => {
  const media = createSourceMedia(context)
  return {
    getMedia: media.getMedia,
    start: async () => {
      if (!context.mqtt) {
        throw new Error("MQTT is not configured.")
      }
      await Promise.all(
        context.channels.map((channel) =>
          context.mqtt?.subscribe(
            topicFor({ context, channelId: channel.id }),
          ),
        ),
      )
    },
    dispose: () => {
      context.channels.forEach((channel) => {
        void context.mqtt?.unsubscribe?.(
          topicFor({ context, channelId: channel.id }),
        )
      })
    },
    handleMqttMessage: ({ topic, payload }) => {
      context.channels
        .filter(
          (channel) =>
            topicFor({ context, channelId: channel.id }) ===
            topic,
        )
        .forEach((channel) => {
          try {
            const normalized = normalizeMqttPayload({
              type: channel.type,
              data: JSON.parse(payload),
            })
            const parsed =
              channel.type === "entities.v1"
                ? builtinContractSchemas[
                    "entities.v1"
                  ].safeParse(normalized)
                : undefined
            const data =
              parsed?.success && context.appendHistory
                ? {
                    entities: context.appendHistory({
                      channelId: channel.id,
                      entities: parsed.data.entities,
                      hours:
                        finiteNumber(
                          channel.settings.historyHours,
                        ) ?? 0,
                    }),
                  }
                : normalized
            context.publish({
              channelId: channel.id,
              data: media.rewrite({
                channelId: channel.id,
                data,
              }),
            })
          } catch {
            context.reportError({
              channelId: channel.id,
              error: "The MQTT payload is not valid JSON.",
            })
          }
        })
    },
    executeAction: async ({
      channelId,
      action,
      payload,
    }) => {
      const channel = context.channels.find(
        (entry) => entry.id === channelId,
      )
      const commandTopic = textValue(
        channel?.settings.commandTopic,
      )
      const actions = Array.isArray(
        channel?.settings.actions,
      )
        ? channel.settings.actions
        : []
      if (
        !context.mqtt ||
        !commandTopic ||
        !actions.includes(action)
      ) {
        throw new Error(
          "This MQTT channel does not allow that action.",
        )
      }
      await context.mqtt.publish({
        topic: commandTopic,
        payload: JSON.stringify({ ...payload, action }),
        isRetained: false,
      })
      return { ok: true }
    },
  }
}
