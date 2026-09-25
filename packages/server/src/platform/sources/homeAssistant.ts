import type {
  ChannelDefinition,
  ContractData,
} from "@castkit/sdk/contracts"
import type { SourceFactory } from "@castkit/sdk/plugin"
import {
  parseNowPlayingPayload,
  parseWeatherPayload,
} from "@castkit/shared/viewData/parsers"
import {
  finiteNumber,
  pollingSource,
  record,
  sourceRequest,
  stringList,
  textValue,
} from "./http.ts"

const domainActions: Record<string, string[]> = {
  light: ["turn_on", "turn_off", "toggle"],
  switch: ["turn_on", "turn_off", "toggle"],
  fan: ["turn_on", "turn_off", "toggle", "set_percentage"],
  cover: [
    "open_cover",
    "close_cover",
    "stop_cover",
    "set_cover_position",
  ],
  lock: ["lock", "unlock"],
  climate: [
    "set_temperature",
    "set_hvac_mode",
    "set_fan_mode",
  ],
  timer: ["start", "pause", "cancel", "finish"],
  button: ["press"],
  input_button: ["press"],
  input_boolean: ["turn_on", "turn_off", "toggle"],
  input_number: ["set_value"],
  input_text: ["set_value"],
  number: ["set_value"],
  input_select: ["select_option"],
  select: ["select_option"],
  script: ["turn_on", "turn_off"],
  scene: ["turn_on"],
  automation: ["turn_on", "turn_off", "trigger"],
  media_player: [
    "media_play_pause",
    "media_play",
    "media_pause",
    "media_next_track",
    "media_previous_track",
    "volume_set",
    "volume_mute",
  ],
}
const allowedAttributes = [
  "friendly_name",
  "md",
  "next_rising",
  "next_setting",
  "unit_of_measurement",
  "device_class",
  "icon",
  "supported_features",
  "brightness",
  "color_temp_kelvin",
  "min_color_temp_kelvin",
  "max_color_temp_kelvin",
  "rgb_color",
  "percentage",
  "preset_modes",
  "preset_mode",
  "temperature",
  "current_temperature",
  "target_temp_high",
  "target_temp_low",
  "min_temp",
  "max_temp",
  "hvac_modes",
  "hvac_action",
  "fan_modes",
  "fan_mode",
  "current_position",
  "duration",
  "remaining",
  "finishes_at",
  "latitude",
  "longitude",
  "gps_accuracy",
  "options",
  "min",
  "max",
  "step",
  "media_title",
  "media_artist",
  "media_album_name",
  "media_duration",
  "media_position",
  "media_position_updated_at",
  "volume_level",
  "is_volume_muted",
  "source",
  "source_list",
]
const parameters: Record<string, string[]> = {
  set_percentage: ["percentage"],
  set_cover_position: ["position"],
  set_temperature: [
    "temperature",
    "target_temp_high",
    "target_temp_low",
    "hvac_mode",
  ],
  set_hvac_mode: ["hvac_mode"],
  set_fan_mode: ["fan_mode"],
  set_value: ["value"],
  select_option: ["option"],
  volume_set: ["volume_level"],
  volume_mute: ["is_volume_muted"],
  start: ["duration"],
  turn_on: ["brightness", "color_temp_kelvin", "rgb_color"],
  unlock: ["code"],
  lock: ["code"],
}
const mediaPath = ({
  channelId,
  entityId,
  kind,
}: {
  channelId: string
  entityId: string
  kind: string
}) =>
  `/api/platform/channels/${encodeURIComponent(channelId)}/media/${encodeURIComponent(entityId)}?kind=${kind}`
/** Normalize a selected HA state without exposing tokens or unrelated attributes. */
export const normalizeHomeAssistantEntity = (
  value: unknown,
): ContractData["entities.v1"]["entities"][number] => {
  const state = record(value)
  const id = textValue(state.entity_id)
  const domain = id.split(".")[0] ?? ""
  const attributes = record(state.attributes)
  return {
    id,
    name: textValue(attributes.friendly_name) || id,
    state: textValue(state.state),
    domain,
    attributes: Object.fromEntries(
      Object.entries(attributes).filter(([key]) =>
        allowedAttributes.includes(key),
      ),
    ),
    actions:
      state.state === "unavailable"
        ? []
        : (domainActions[domain] ?? []),
  }
}
/** A direct, optional HA connection supplies selected entities and narrow actions. */
export const createHomeAssistantSource: SourceFactory = (
  context,
) => {
  const headers = {
    Authorization: `Bearer ${context.secrets.token ?? ""}`,
  }
  const state: { states: Record<string, unknown>[] } = {
    states: [],
  }
  const historyCache = new Map<
    string,
    { at: number; data: unknown }
  >()
  const selectedIds = (channel: ChannelDefinition) => {
    const helperId = textValue(
      channel.settings.entityListEntity,
    )
    const helper = state.states.find(
      (entity) => entity.entity_id === helperId,
    )
    const value =
      record(helper?.attributes)[
        textValue(channel.settings.entityListAttribute) ||
          "entity_id"
      ] ?? helper?.state
    const linked = (() => {
      if (typeof value !== "string") {
        return stringList(value)
      }
      try {
        return stringList(JSON.parse(value))
      } catch {
        return stringList(value)
      }
    })()
    return Array.from(
      new Set(
        stringList(channel.settings.entityIds).concat(
          linked,
        ),
      ),
    )
  }
  const selected = (channel: ChannelDefinition) =>
    selectedIds(channel).flatMap((id) =>
      state.states.filter(
        (entity) => entity.entity_id === id,
      ),
    )
  const getHistory = async (channel: ChannelDefinition) => {
    const hours = Math.min(
      168,
      Math.max(
        0,
        finiteNumber(channel.settings.historyHours) ?? 0,
      ),
    )
    if (!hours) {
      return new Map<
        string,
        {
          history: { time: string; value: number }[]
          stateHistory: { time: string; state: string }[]
        }
      >()
    }
    const key = JSON.stringify(channel.settings)
    const cached = historyCache.get(key)
    const response =
      cached && Date.now() - cached.at < 60000
        ? cached.data
        : await (
            await sourceRequest({
              context,
              headers,
              path: `/api/history/period/${encodeURIComponent(new Date(Date.now() - hours * 3600000).toISOString())}?filter_entity_id=${encodeURIComponent(selectedIds(channel).join(","))}&minimal_response&no_attributes`,
            })
          ).json()
    historyCache.set(key, {
      at: Date.now(),
      data: response,
    })
    return new Map(
      (Array.isArray(response) ? response : [])
        .filter(Array.isArray)
        .map((series) => {
          const entries = series.map(record).slice(-1000)
          return [
            textValue(record(series[0]).entity_id),
            {
              history: entries
                .filter(
                  (entry) =>
                    textValue(entry.state).trim() &&
                    Number.isFinite(Number(entry.state)),
                )
                .map((entry) => ({
                  time: textValue(entry.last_changed),
                  value: Number(entry.state),
                })),
              stateHistory: entries.map((entry) => ({
                time: textValue(entry.last_changed),
                state: textValue(entry.state),
              })),
            },
          ] as const
        }),
    )
  }
  const publishChannel = async (
    channel: ChannelDefinition,
  ) => {
    const entities = selected(channel)
    if (channel.type === "entities.v1") {
      const history = await getHistory(channel)
      context.publish({
        channelId: channel.id,
        data: {
          entities: entities.map((value) => {
            const entity =
              normalizeHomeAssistantEntity(value)
            return {
              ...entity,
              attributes: {
                ...entity.attributes,
                ...(history.has(entity.id)
                  ? history.get(entity.id)
                  : {}),
              },
            }
          }),
        },
      })
    } else if (channel.type === "now-playing.v1") {
      const entity =
        entities.find(
          (entry) => entry.state === "playing",
        ) ??
        entities.find(
          (entry) => entry.state === "paused",
        ) ??
        entities[0]
      const attributes = record(entity?.attributes)
      const entityId = textValue(entity?.entity_id)
      context.publish({
        channelId: channel.id,
        data: {
          entityId,
          ...parseNowPlayingPayload({
            title:
              attributes.media_title ?? "Nothing playing",
            artist: attributes.media_artist ?? "",
            album: attributes.media_album_name,
            isPlaying: entity?.state === "playing",
            position: attributes.media_position,
            positionUpdatedAt:
              attributes.media_position_updated_at,
            duration: attributes.media_duration,
            volume: attributes.volume_level,
            isMuted: attributes.is_volume_muted,
            ...(attributes.entity_picture
              ? {
                  artwork: mediaPath({
                    channelId: channel.id,
                    entityId,
                    kind: "artwork",
                  }),
                }
              : {}),
          }),
        },
      })
    } else if (channel.type === "weather.v1") {
      const entity = entities[0]
      const attributes = record(entity?.attributes)
      const data = parseWeatherPayload({
        temperature: attributes.temperature,
        condition: entity?.state,
      })
      if (!data) {
        throw new Error(
          "The selected weather entity has no temperature.",
        )
      }
      const forecastType = textValue(
        channel.settings.forecastType,
      )
      const forecast = ["hourly", "daily"].includes(
        forecastType,
      )
        ? await sourceRequest({
            context,
            headers,
            path: "/api/services/weather/get_forecasts?return_response",
            method: "POST",
            body: {
              entity_id: textValue(entity?.entity_id),
              type: forecastType,
            },
          })
            .then((response) => response.json())
            .then((response) => {
              const rows = record(
                record(record(response).service_response)[
                  textValue(entity?.entity_id)
                ],
              ).forecast
              return (Array.isArray(rows) ? rows : [])
                .map(record)
                .filter(
                  (row) =>
                    typeof row.datetime === "string" &&
                    typeof row.temperature === "number",
                )
                .map((row) => ({
                  datetime: row.datetime,
                  temperature: row.temperature,
                  ...(finiteNumber(row.templow) !==
                  undefined
                    ? { temperatureLow: row.templow }
                    : {}),
                  ...(finiteNumber(
                    row.precipitation_probability,
                  ) !== undefined
                    ? {
                        precipitationProbability:
                          row.precipitation_probability,
                      }
                    : {}),
                  ...(finiteNumber(row.precipitation) !==
                  undefined
                    ? { precipitation: row.precipitation }
                    : {}),
                  ...(typeof row.condition === "string"
                    ? { condition: row.condition }
                    : {}),
                }))
                .slice(0, 48)
            })
        : undefined
      context.publish({
        channelId: channel.id,
        data: {
          ...data,
          ...(forecast ? { forecast } : {}),
          ...(typeof attributes.temperature_unit ===
          "string"
            ? {
                temperatureUnit:
                  attributes.temperature_unit,
              }
            : {}),
          ...(typeof attributes.precipitation_unit ===
          "string"
            ? {
                precipitationUnit:
                  attributes.precipitation_unit,
              }
            : {}),
        },
      })
    } else if (channel.type === "images.v1") {
      context.publish({
        channelId: channel.id,
        data: {
          images: entities
            .filter(
              (entity) =>
                typeof record(entity.attributes)
                  .entity_picture === "string",
            )
            .map((entity) => ({
              id: textValue(entity.entity_id),
              title:
                textValue(
                  record(entity.attributes).friendly_name,
                ) || textValue(entity.entity_id),
              url: mediaPath({
                channelId: channel.id,
                entityId: textValue(entity.entity_id),
                kind: "artwork",
              }),
            })),
        },
      })
    } else if (channel.type === "cameras.v1") {
      context.publish({
        channelId: channel.id,
        data: {
          cameras: entities
            .filter((entry) =>
              textValue(entry.entity_id).startsWith(
                "camera.",
              ),
            )
            .map((entry) => ({
              id: textValue(entry.entity_id),
              name:
                textValue(
                  record(entry.attributes).friendly_name,
                ) || textValue(entry.entity_id),
              url: mediaPath({
                channelId: channel.id,
                entityId: textValue(entry.entity_id),
                kind: "camera",
              }),
              isLive: false,
            })),
        },
      })
    } else if (channel.type === "agenda.v1") {
      const start = new Date().toISOString()
      const end = new Date(
        Date.now() + 7 * 86400000,
      ).toISOString()
      const events = await Promise.all(
        entities.map(async (entity) => {
          const response = await sourceRequest({
            context,
            headers,
            path: `/api/calendars/${encodeURIComponent(textValue(entity.entity_id))}?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
          })
          const results = await response.json()
          return (Array.isArray(results) ? results : [])
            .map((raw) => {
              const event = record(raw)
              const time = record(event.start)
              return {
                startMs: Date.parse(
                  textValue(time.dateTime) ||
                    textValue(time.date),
                ),
                summary: textValue(event.summary),
                isAllDay: typeof time.date === "string",
              }
            })
            .filter((event) =>
              Number.isFinite(event.startMs),
            )
        }),
      )
      context.publish({
        channelId: channel.id,
        data: {
          events: events
            .flat()
            .sort(
              (first, second) =>
                first.startMs - second.startMs,
            ),
        },
      })
    }
  }
  const poll = async () => {
    const response = await sourceRequest({
      context,
      headers,
      path: "/api/states",
    })
    const states = await response.json()
    if (!Array.isArray(states)) {
      throw new Error(
        "Home Assistant returned invalid states.",
      )
    }
    state.states = states.map(record)
    await Promise.all(
      context.channels.map(async (channel) => {
        try {
          await publishChannel(channel)
        } catch {
          context.reportError({
            channelId: channel.id,
            error:
              "The selected Home Assistant data is unavailable.",
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
        5,
    }),
    discover: async () => {
      const response = await sourceRequest({
        context,
        headers,
        path: "/api/states",
      })
      const data = await response.json()
      return (Array.isArray(data) ? data : []).map(
        normalizeHomeAssistantEntity,
      )
    },
    executeAction: async ({
      channelId,
      action,
      payload,
    }) => {
      const channel = context.channels.find(
        (entry) => entry.id === channelId,
      )
      const entityId = textValue(payload.entityId)
      const domain = entityId.split(".")[0] ?? ""
      if (
        !channel ||
        !selectedIds(channel).includes(entityId) ||
        !domainActions[domain]?.includes(action)
      ) {
        throw new Error(
          "This channel does not allow that entity action.",
        )
      }
      const serviceData = Object.fromEntries(
        Object.entries(payload).filter(([key]) =>
          parameters[action]?.includes(key),
        ),
      )
      const scriptFields = (() => {
        try {
          return record(
            JSON.parse(
              textValue(
                channel.settings.scriptFieldsJson,
              ) || "{}",
            ),
          )
        } catch {
          return {}
        }
      })()
      const variables =
        domain === "script" && action === "turn_on"
          ? Object.fromEntries(
              Object.entries(
                record(payload.variables),
              ).filter(([key]) =>
                stringList(scriptFields[entityId]).includes(
                  key,
                ),
              ),
            )
          : undefined
      const response = await sourceRequest({
        context,
        headers,
        path: `/api/services/${domain}/${action}`,
        method: "POST",
        body: {
          ...serviceData,
          ...(variables ? { variables } : {}),
          entity_id: entityId,
        },
      })
      const result = await response.json()
      await poll().catch(() =>
        context.reportError({
          channelId,
          error:
            "The action succeeded, but the latest source state could not be refreshed.",
        }),
      )
      return result
    },
    getMedia: async ({ channelId, assetId, kind }) => {
      const channel = context.channels.find(
        (entry) => entry.id === channelId,
      )
      if (
        !channel ||
        !selectedIds(channel).includes(assetId)
      ) {
        throw new Error(
          "This channel does not include that media.",
        )
      }
      if (
        kind === "camera" &&
        assetId.startsWith("camera.")
      ) {
        return sourceRequest({
          context,
          headers,
          path: `/api/camera_proxy/${encodeURIComponent(assetId)}`,
        })
      }
      const entity = state.states.find(
        (entry) => entry.entity_id === assetId,
      )
      const picture = textValue(
        record(entity?.attributes).entity_picture,
      )
      if (
        !picture.startsWith("/api/") ||
        picture.startsWith("//")
      ) {
        throw new Error(
          "No supported media is available for this entity.",
        )
      }
      return sourceRequest({
        context,
        headers,
        path: picture,
      })
    },
  }
}
