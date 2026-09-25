import { resolve } from "node:path"
import {
  DITHER_ALGORITHMS,
  type DitherAlgorithm,
} from "@castkit/core/devices/device"
import type { FullColorEncoding } from "@castkit/core/pipeline/dither"
import type { ConfigKnob } from "@castkit/shared/framework/configKnob"
import {
  getIsPhotoView,
  getIsViewName,
  type ViewName,
} from "@castkit/shared/views/viewNames"
import { serve } from "@hono/node-server"
import { createPhotoFrameAdapter } from "./adapters/photoFrameAdapter.ts"
import { createApp } from "./app.ts"
import { createBrowserMode } from "./browser/browserMode.ts"
import {
  type ConfiguredDevice,
  loadConfig,
} from "./config/env.ts"
import {
  buildAvailabilityTopic,
  buildDeviceTopics,
  buildDiscoveryMessages,
  buildGlobalDiscoveryMessages,
  buildGlobalTopics,
} from "./homeAssistant/discovery.ts"
import { DEFAULT_PEOPLE_MINIMUM } from "./immich/immichClient.ts"
import { createMqttPublisher } from "./mqtt/publisher.ts"
import {
  parseAgendaPayload,
  parseNowPlayingPayload,
  parseWeatherPayload,
} from "./mqtt/viewDataPayloads.ts"
import { createPlatformImageScheduler } from "./platform/imageScheduler.ts"
import { createPlatform } from "./platform/platform.ts"
import { attachPlatformSockets } from "./platform/platformSockets.ts"
import { createPushController } from "./pushController.ts"
import { fetchArtworkDataUri } from "./render/artworkFetch.ts"
import { createRenderService } from "./render/renderService.ts"
import { startClockTicker } from "./schedulers/clockTicker.ts"
import {
  type ClockDateStyle,
  type ClockDateStyleSetting,
  type ClockTimeFormat,
  type ClockTimeFormatSetting,
  createDeviceConfigStore,
  MARGIN_EDGES,
  type MarginEdge,
  type PanelRotation,
  PHOTO_CROP_EDGES,
  type PhotoCropEdge,
  type PhotoFormat,
  type PhotoFormatSetting,
} from "./state/deviceConfigStore.ts"
import { createDeviceDefinitionStore } from "./state/deviceDefinitionStore.ts"
import { createDeviceStore } from "./state/deviceStore.ts"
import { createRenderTokenStore } from "./state/renderTokenStore.ts"
import { createViewDataStore } from "./state/viewDataStore.ts"
import {
  getIsAgendaView,
  getIsClockBearingView,
  getIsNowPlayingView,
} from "./views/registry.ts"
import {
  getRepaintFactsForDevice,
  getViewsForDevice,
} from "./views/viewsForDevice.ts"

/**
 * Inkcast server entrypoint. Boots the render engine + MQTT bridge, advertises
 * every device to Home Assistant via MQTT discovery, subscribes to the HA
 * command topics, pushes an initial frame per device, and serves the HTTP API.
 */
/**
 * Load a local `.env` if present (gitignored) — from the working directory
 * or the repo root (so `yarn workspace @castkit/server dev`, whose cwd is
 * `packages/server`, finds it too). In containers, env is usually passed
 * directly, so a missing file is fine.
 */
const loadEnvironmentFile = () => {
  const candidatePaths = [
    resolve(process.cwd(), ".env"),
    // packages/server/{src,dist}/index.* → the repo root.
    resolve(import.meta.dirname, "../../../.env"),
  ]

  candidatePaths.some((candidatePath) => {
    try {
      process.loadEnvFile(candidatePath)
      return true
    } catch {
      return false
    }
  })
}

const getIsDitherAlgorithm = (
  value: string,
): value is DitherAlgorithm =>
  (DITHER_ALGORITHMS as readonly string[]).includes(value)

// Fallback defaults for the Photo Frame tuning knobs, used until the HA config
// entities (global default + per-device override) restore/seed their retained
// state. Formerly the INKCAST_PHOTO_MINUTES / _RECENCY_HALF_LIFE_DAYS env vars.
const DEFAULT_PHOTO_INTERVAL_MINUTES = 10
const DEFAULT_PHOTO_RECENCY_HALF_LIFE_DAYS = 365
// The full-color photo format shipped until an HA config entity overrides it.
// JPEG (not WebP) because the only current photo panel is an ARMv6 Pi that
// SIGILLs on WebP decode — see the JPEG-not-WebP decision record.
const DEFAULT_PHOTO_FORMAT: PhotoFormat = "jpeg"
const DEFAULT_PHOTO_QUALITY = 80

/**
 * Canonicalize an HA photo-format option payload ("Auto"/"JPEG"/"WebP"/"PNG",
 * any case) to a per-device setting, or null if unrecognized. "Auto" = inherit
 * the global default.
 */
const parsePhotoFormatSetting = (
  payload: string,
): PhotoFormatSetting | null => {
  const normalized = payload.trim().toLowerCase()
  if (normalized === "auto") {
    return "auto"
  }
  return (
    (["jpeg", "webp", "png"] as const).find(
      (format) => format === normalized,
    ) ?? null
  )
}

/**
 * The exact HA option string for a stored photo-format setting — must match the
 * select's `options` casing ("WebP", not "WEBP") so HA accepts the round-tripped
 * retained state.
 */
const PHOTO_FORMAT_OPTION_BY_SETTING: Record<
  PhotoFormatSetting,
  string
> = {
  auto: "Auto",
  jpeg: "JPEG",
  webp: "WebP",
  png: "PNG",
}

// Clock defaults, used until an HA config entity (global default + per-device
// override) overrides them: 12-hour time, long dates, and the process `TZ`
// (an empty timezone string). Time is Inkcast's own clock; only the format +
// zone are MQTT config.
const DEFAULT_CLOCK_TIME_FORMAT: ClockTimeFormat = "12h"
const DEFAULT_CLOCK_DATE_STYLE: ClockDateStyle = "long"

/** The exact HA option string for a time-format setting (matches the select). */
const CLOCK_TIME_FORMAT_OPTION_BY_SETTING: Record<
  ClockTimeFormatSetting,
  string
> = {
  auto: "Auto",
  "12h": "12-hour",
  "24h": "24-hour",
}

/** Canonicalize an HA time-format option payload to a setting, or null. */
const parseClockTimeFormatSetting = (
  payload: string,
): ClockTimeFormatSetting | null => {
  const normalized = payload.trim().toLowerCase()
  if (normalized === "auto") {
    return "auto"
  }
  if (
    normalized === "12-hour" ||
    normalized === "12h" ||
    normalized === "12"
  ) {
    return "12h"
  }
  if (
    normalized === "24-hour" ||
    normalized === "24h" ||
    normalized === "24"
  ) {
    return "24h"
  }
  return null
}

/** The exact HA option string for a date-style setting (matches the select). */
const CLOCK_DATE_STYLE_OPTION_BY_SETTING: Record<
  ClockDateStyleSetting,
  string
> = {
  auto: "Auto",
  long: "Long",
  numeric: "Numeric",
}

/** Canonicalize an HA date-style option payload to a setting, or null. */
const parseClockDateStyleSetting = (
  payload: string,
): ClockDateStyleSetting | null => {
  const normalized = payload.trim().toLowerCase()
  if (normalized === "auto") {
    return "auto"
  }
  if (normalized === "long") {
    return "long"
  }
  if (normalized === "numeric") {
    return "numeric"
  }
  return null
}

const ROTATION_VALUES: readonly PanelRotation[] = [
  0, 90, 180, 270,
]

/** Parse an HA rotation-select payload ("0"/"90"/"180"/"270") to a PanelRotation, or null. */
const parseRotation = (
  payload: string,
): PanelRotation | null => {
  const value = Number.parseInt(payload, 10)
  return (
    ROTATION_VALUES.find(
      (rotation) => rotation === value,
    ) ?? null
  )
}

/** Parse + clamp an HA number-entity payload ("50".."200", % steps). */
const parsePercentPayload = (payload: string) => {
  const value = Number.parseFloat(payload)
  if (Number.isNaN(value)) {
    return null
  }
  return Math.min(200, Math.max(50, Math.round(value)))
}

/** Parse + clamp a margin/crop HA number-entity payload ("0".."200" px). */
const parsePixelPayload = (payload: string) => {
  const value = Number.parseFloat(payload)
  if (Number.isNaN(value)) {
    return null
  }
  return Math.min(200, Math.max(0, Math.round(value)))
}

/**
 * Parse an HA switch-entity payload into a boolean, or null to reject. Accepts
 * the MQTT-switch defaults ("ON"/"OFF") case-insensitively, plus "true"/"false"
 * and "1"/"0" so a hand-published topic or a non-HA client still works.
 */
const parseSwitchPayload = (payload: string) => {
  const normalized = payload.trim().toLowerCase()
  if (["on", "true", "1"].includes(normalized)) {
    return true
  }
  if (["off", "false", "0"].includes(normalized)) {
    return false
  }
  return null
}

/** Parse + clamp an integer HA number-entity payload into [min, max]. */
const parseBoundedInteger = ({
  payload,
  min,
  max,
}: {
  payload: string
  min: number
  max: number
}) => {
  const value = Number.parseFloat(payload)
  if (Number.isNaN(value)) {
    return null
  }
  return Math.min(max, Math.max(min, Math.round(value)))
}

/** The config-knob kind key for a margin edge (matches the MQTT topic slug). */
const getMarginKnobKind = (edge: MarginEdge) =>
  `margin_${edge}`

/** The config-knob kind key for a photo-crop edge (matches its topic slug). */
const getPhotoCropKnobKind = (edge: PhotoCropEdge) =>
  `photo_crop_${edge}`

// The ConfigKnob framework type lives in @castkit/shared — both client modes
// use retained-MQTT-state-as-persistence knobs.

/**
 * How long to let the broker replay retained messages before the server acts on
 * what it thinks the saved state is. MQTT has no end-of-retained signal, so this
 * is a window, not a handshake — `pushDevice` re-checks after every render for
 * the case where a value still arrives late.
 */
const RETAINED_SETTLE_MILLISECONDS = 5_000

const main = async () => {
  loadEnvironmentFile()

  const config = loadConfig()
  const { baseTopic } = config.mqtt

  const publisher = await createMqttPublisher({
    config: config.mqtt,
    availabilityTopic: buildAvailabilityTopic(baseTopic),
  })
  const platform = await createPlatform({
    file: config.platformFile,
    devices: config.devices,
    browserDevices: config.browserDevices,
    apiToken: config.apiToken,
    publisher,
    publicUrl: config.publicUrl,
    discoveryPrefix: config.mqtt.discoveryPrefix,
    topicPrefix: config.mqtt.baseTopic,
  })
  const renderService = await createRenderService({
    engineName: config.renderEngine,
  })
  const deviceStore = createDeviceStore({
    deviceIds: config.devices.map((device) => device.id),
  })
  const deviceDefinitionStore = createDeviceDefinitionStore(
    {
      devices: config.devices,
      browserDevices: config.browserDevices,
      devicesFile: config.devicesFile,
    },
  )
  const viewDataStore = createViewDataStore()
  const deviceConfigStore = createDeviceConfigStore()

  // The photo rotation interval and photo recency half-life are HA config
  // (global default on the Inkcast Server device + a per-display override),
  // resolved live from the config store — no env vars. See docs/decisions/
  // 2026-07-03-user-tunable-view-settings-are-ha-config-entities.md.
  const resolvePhotoIntervalMinutes = (
    deviceId: string,
  ) => {
    const perDevice =
      deviceConfigStore.getPhotoIntervalMinutes(deviceId)
    if (perDevice !== undefined && perDevice > 0) {
      return perDevice
    }
    const global =
      deviceConfigStore.getGlobalPhotoIntervalMinutes()
    if (global !== undefined && global > 0) {
      return global
    }
    return DEFAULT_PHOTO_INTERVAL_MINUTES
  }
  const resolvePhotoRecencyHalfLifeDays = (
    deviceId: string,
  ) => {
    const perDevice =
      deviceConfigStore.getPhotoRecencyHalfLifeDays(
        deviceId,
      )
    if (perDevice !== undefined && perDevice > 0) {
      return perDevice
    }
    const global =
      deviceConfigStore.getGlobalPhotoRecencyHalfLifeDays()
    if (global !== undefined && global > 0) {
      return global
    }
    return DEFAULT_PHOTO_RECENCY_HALF_LIFE_DAYS
  }
  const resolvePhotoPeopleMinimum = (deviceId: string) => {
    const perDevice =
      deviceConfigStore.getPhotoPeopleMinimum(deviceId)
    if (perDevice !== undefined && perDevice > 0) {
      return perDevice
    }
    const global =
      deviceConfigStore.getGlobalPhotoPeopleMinimum()
    if (global !== undefined && global > 0) {
      return global
    }
    return DEFAULT_PEOPLE_MINIMUM
  }
  // The photo wire format + lossy quality, resolved per device: a real
  // per-device value wins; "Auto"/0 (or unset) inherit the global default; and
  // if neither is set the ARMv6-safe fallback (JPEG q80) applies.
  const resolvePhotoEncoding = (
    deviceId: string,
  ): FullColorEncoding => {
    const perDeviceFormat =
      deviceConfigStore.getPhotoFormat(deviceId)
    const format: PhotoFormat =
      perDeviceFormat && perDeviceFormat !== "auto"
        ? perDeviceFormat
        : (deviceConfigStore.getGlobalPhotoFormat() ??
          DEFAULT_PHOTO_FORMAT)

    const perDeviceQuality =
      deviceConfigStore.getPhotoQuality(deviceId)
    const quality =
      perDeviceQuality !== undefined && perDeviceQuality > 0
        ? perDeviceQuality
        : (deviceConfigStore.getGlobalPhotoQuality() ??
          DEFAULT_PHOTO_QUALITY)

    return { format, quality }
  }
  // The clock timezone + time/date format, resolved per device: a real
  // per-device value wins; "Auto"/empty inherit the global default; and if
  // neither is set, the process `TZ` + 12-hour + long-date fallbacks apply.
  const resolveClockConfig = (deviceId: string) => {
    const timezone =
      deviceConfigStore.getClockTimezone(deviceId) ||
      deviceConfigStore.getGlobalClockTimezone()
    const timeFormatSetting =
      deviceConfigStore.getClockTimeFormat(deviceId)
    const timeFormat: ClockTimeFormat =
      timeFormatSetting && timeFormatSetting !== "auto"
        ? timeFormatSetting
        : (deviceConfigStore.getGlobalClockTimeFormat() ??
          DEFAULT_CLOCK_TIME_FORMAT)
    const dateStyleSetting =
      deviceConfigStore.getClockDateStyle(deviceId)
    const dateStyle: ClockDateStyle =
      dateStyleSetting && dateStyleSetting !== "auto"
        ? dateStyleSetting
        : (deviceConfigStore.getGlobalClockDateStyle() ??
          DEFAULT_CLOCK_DATE_STYLE)
    return {
      timeZone: timezone || undefined,
      isTwelveHour: timeFormat === "12h",
      isNumericDate: dateStyle === "numeric",
    }
  }

  /**
   * The GLOBAL clock config (no per-device override) that browser devices
   * format against — the server-wide Clock:* knobs, same source the image
   * devices resolve from.
   */
  const getGlobalClockConfig = () => {
    const timeFormat =
      deviceConfigStore.getGlobalClockTimeFormat() ??
      DEFAULT_CLOCK_TIME_FORMAT
    const dateStyle =
      deviceConfigStore.getGlobalClockDateStyle() ??
      DEFAULT_CLOCK_DATE_STYLE
    return {
      timeZone:
        deviceConfigStore.getGlobalClockTimezone() ||
        undefined,
      isTwelveHour: timeFormat === "12h",
      isNumericDate: dateStyle === "numeric",
    }
  }

  // Minted here (not in createApp) because the push path also mints render-URL
  // tokens for "http-pull" panels — the same store the public
  // `/render/<token>.png` endpoint serves.
  const renderTokenStore = createRenderTokenStore({
    ttlMinutes: 10,
  })
  renderTokenStore.startSweeper()

  const pushController = createPushController({
    getPlatformSelection: (deviceId) => {
      const screenId =
        platform.store.get().deviceScreens[deviceId]
      return screenId
        ? JSON.stringify(
            platform.getTarget({
              kind: "screen",
              id: screenId,
            })?.view,
          )
        : undefined
    },
    renderPlatform: async ({
      device,
      margin,
      adjustments,
    }) => {
      const screenId =
        platform.store.get().deviceScreens[device.id]
      if (!screenId) return null
      return renderService.renderPage({
        device,
        margin,
        adjustments,
        url: `http://127.0.0.1:${config.port}/screen/${encodeURIComponent(screenId)}?device=${encodeURIComponent(device.id)}&capture=1`,
        headers: {
          "x-castkit-render-key": platform.renderKey,
        },
      })
    },
    devices: config.devices,
    deviceStore,
    deviceConfigStore,
    viewDataStore,
    renderService,
    publisher,
    baseTopic,
    resolvePhotoEncoding,
    resolveClockConfig,
    renderTokenStore,
    publicUrl: config.publicUrl,
  })

  const pushDeviceLogged = (deviceId: string) => {
    pushController.pushDevice(deviceId).catch((error) => {
      console.error(
        `[inkcast] push failed for ${deviceId}`,
        error,
      )
    })
  }

  /** Push every device whose SELECTED view matches, without awaiting. */
  const pushDevicesShowingView = ({
    getIsDeviceIncluded,
    getIsViewIncluded,
  }: {
    /** Optional second gate on the DEVICE, not the view it is showing. */
    getIsDeviceIncluded?: (
      device: (typeof config.devices)[number],
    ) => boolean
    getIsViewIncluded: (viewName: ViewName) => boolean
  }) => {
    config.devices
      .filter((device) =>
        getIsViewIncluded(
          deviceStore.getActiveView(device.id),
        ),
      )
      .filter(
        (device) => getIsDeviceIncluded?.(device) ?? true,
      )
      .forEach((device) => {
        pushDeviceLogged(device.id)
      })
  }

  // MQTT data-in: Home Assistant PUSHES each display its now-playing / weather /
  // agenda payload (`inkcast/<device>/{now_playing,weather,agenda}/set`);
  // Inkcast parses it into the view-data store and re-pushes that display if the
  // affected view is showing. Inkcast never reads HA — all source/priority/
  // exclusion logic lives in the HA templates that produce these payloads. See
  // docs/decisions/2026-07-04-inkcast-renders-ha-pushed-data-not-reads-ha.md.
  //
  // Payloads are JSON; the per-view parsers are defensive, so a non-JSON or
  // empty payload degrades to the view's idle placeholder rather than throwing.
  const parseJsonPayload = (payload: string): unknown => {
    try {
      return JSON.parse(payload)
    } catch {
      return undefined
    }
  }
  const applyNowPlayingPayload = async ({
    deviceId,
    payload,
  }: {
    deviceId: string
    payload: string
  }) => {
    const nowPlaying = parseNowPlayingPayload(
      parseJsonPayload(payload),
    )
    // The artwork URL HA pushed is fetched + inlined for the render engines;
    // the URL itself is the cache key (HA rotates it when the art changes).
    const artworkDataUri = nowPlaying.artworkPath
      ? await fetchArtworkDataUri({
          url: nowPlaying.artworkPath,
        })
      : undefined
    viewDataStore.setNowPlaying({
      deviceId,
      data: artworkDataUri
        ? { ...nowPlaying, artworkDataUri }
        : nowPlaying,
    })
    if (
      getIsNowPlayingView(
        deviceStore.getActiveView(deviceId),
      )
    ) {
      pushDeviceLogged(deviceId)
    }
  }

  const applyWeatherPayload = ({
    deviceId,
    payload,
  }: {
    deviceId: string
    payload: string
  }) => {
    const weather = parseWeatherPayload(
      parseJsonPayload(payload),
    )
    if (!weather) {
      return
    }
    viewDataStore.setWeather({ deviceId, data: weather })
    if (
      deviceStore.getActiveView(deviceId) ===
      "Clock (Weather)"
    ) {
      pushDeviceLogged(deviceId)
    }
  }

  const applyAgendaPayload = ({
    deviceId,
    payload,
  }: {
    deviceId: string
    payload: string
  }) => {
    viewDataStore.setAgenda({
      deviceId,
      data: parseAgendaPayload(parseJsonPayload(payload)),
    })
    // Every agenda view repaints on new data. For the clock-bearing one this
    // is belt-and-braces (the minute tick would catch it); for the clockless
    // views it is the ONLY thing that repaints them, so it must not be narrowed
    // back to a single view name.
    if (
      getIsAgendaView(deviceStore.getActiveView(deviceId))
    ) {
      pushDeviceLogged(deviceId)
    }
  }

  // Keep clock-bearing panels on real time: re-push them each minute. This
  // also keeps the agenda view honest — the minute tick re-renders it, dropping
  // events that have just started and promoting the next one.
  const clockTicker = startClockTicker({
    onMinuteTick: () => {
      pushDevicesShowingView({
        getIsViewIncluded: getIsClockBearingView,
        // A minute re-push is only worth sending to a panel that can finish
        // drawing inside a minute. A `super-slow` panel parked on a clock view
        // — from a retained state written before the view filter existed —
        // would otherwise flash continuously and never show the right time.
        getIsDeviceIncluded: (device) =>
          getViewsForDevice(
            getRepaintFactsForDevice(device),
          ).includes(deviceStore.getActiveView(device.id)),
      })
    },
  })

  /** Re-push every device on a Photo Frame view (global format/quality changed). */
  const refreshAllPhotoFrameDevices = () => {
    config.devices
      .filter((device) =>
        getIsPhotoView(
          deviceStore.getActiveView(device.id),
        ),
      )
      .forEach((device) => {
        pushDeviceLogged(device.id)
      })
  }

  // Immich photo frame: rotates a recency-weighted random photo of the
  // configured people/query on an interval — for devices SHOWING the Photo
  // Frame (selected or idle-fallback). Enabled only when Immich credentials
  // are set.
  const hasPhotoFrameAdapter = Boolean(
    config.immich.url && config.immich.apiKey,
  )
  const photoFrameAdapter = hasPhotoFrameAdapter
    ? createPhotoFrameAdapter({
        immichConfig: {
          url: config.immich.url,
          apiKey: config.immich.apiKey,
        },
        getIntervalMinutes: resolvePhotoIntervalMinutes,
        getRecencyHalfLifeDays:
          resolvePhotoRecencyHalfLifeDays,
        getPeopleMinimum: resolvePhotoPeopleMinimum,
        devices: config.devices,
        deviceConfigStore,
        viewDataStore,
        getActiveView: deviceStore.getActiveView,
        pushDevice: (deviceId) =>
          pushController.pushDevice(deviceId),
      })
    : null

  /** Clear the current photo and fetch a fresh one (people/query changed). */
  const restartPhotoFrame = async (deviceId: string) => {
    viewDataStore.setPhotoFrame({
      deviceId,
      data: undefined,
    })
    await photoFrameAdapter?.refreshDevice(deviceId)
  }

  if (publisher.isEnabled) {
    // Advertise every device + the server-wide config device to HA
    // (retained discovery configs).
    const discoveryConfig = {
      discoveryPrefix: config.mqtt.discoveryPrefix,
      nodeId: config.mqtt.nodeId,
      baseTopic,
    }
    await Promise.all(
      config.devices
        .flatMap((device) =>
          buildDiscoveryMessages({
            device,
            // Not every view, per device. A panel is only offered views whose
            // shortest-lived value survives its repaint — see the freshness
            // rule in docs/display-properties.md. Passing VIEW_NAMES here is
            // what put `Clock` in a 28-second Impression's Home Assistant
            // select.
            viewNames: getViewsForDevice(
              getRepaintFactsForDevice(device),
            ),
            config: discoveryConfig,
          }),
        )
        .concat(
          buildGlobalDiscoveryMessages(discoveryConfig),
        )
        .map((message) =>
          publisher.publish({
            topic: message.topic,
            payload: JSON.stringify(message.payload),
            isRetained: message.isRetained,
          }),
        ),
    )

    // The HA-editable config knobs, all following one shape: a command
    // topic (user edits), a retained state topic (HA display + boot-time
    // restore — retained MQTT is the persistence layer, no config file).
    const configKnobs: ReadonlyMap<string, ConfigKnob> =
      new Map([
        [
          "photoPeople",
          {
            applyPayload: ({ deviceId, payload }) => {
              deviceConfigStore.setPhotoPeople({
                deviceId,
                peopleText: payload,
              })
              return payload
            },
            getHasValue: (deviceId) =>
              Boolean(
                deviceConfigStore.getPhotoPeople(deviceId),
              ),
            onApplied: restartPhotoFrame,
          },
        ],
        [
          "photoQuery",
          {
            applyPayload: ({ deviceId, payload }) => {
              deviceConfigStore.setPhotoQuery({
                deviceId,
                queryText: payload,
              })
              return payload
            },
            getHasValue: (deviceId) =>
              Boolean(
                deviceConfigStore.getPhotoQuery(deviceId),
              ),
            onApplied: restartPhotoFrame,
          },
        ],
        [
          // 0 = inherit the global default (a number entity always has a
          // value, so 0 is the "unset" sentinel).
          "photoInterval",
          {
            applyPayload: ({ deviceId, payload }) => {
              const minutes = parseBoundedInteger({
                payload,
                min: 0,
                max: 1440,
              })
              if (minutes === null) {
                return null
              }
              deviceConfigStore.setPhotoIntervalMinutes({
                deviceId,
                minutes,
              })
              return String(minutes)
            },
            getHasValue: (deviceId) =>
              deviceConfigStore.getPhotoIntervalMinutes(
                deviceId,
              ) !== undefined,
            // Read live on the next rotation tick — no immediate re-render.
          },
        ],
        [
          "photoRecency",
          {
            applyPayload: ({ deviceId, payload }) => {
              const days = parseBoundedInteger({
                payload,
                min: 0,
                max: 3650,
              })
              if (days === null) {
                return null
              }
              deviceConfigStore.setPhotoRecencyHalfLifeDays(
                {
                  deviceId,
                  days,
                },
              )
              return String(days)
            },
            getHasValue: (deviceId) =>
              deviceConfigStore.getPhotoRecencyHalfLifeDays(
                deviceId,
              ) !== undefined,
            // Read live on the next random pick — no immediate re-render.
          },
        ],
        [
          "photoPeopleMinimum",
          {
            applyPayload: ({ deviceId, payload }) => {
              const minimum = parseBoundedInteger({
                payload,
                min: 0,
                max: 20,
              })
              if (minimum === null) {
                return null
              }
              deviceConfigStore.setPhotoPeopleMinimum({
                deviceId,
                minimum,
              })
              return String(minimum)
            },
            getHasValue: (deviceId) =>
              deviceConfigStore.getPhotoPeopleMinimum(
                deviceId,
              ) !== undefined,
            // Changing who counts changes the pool, so redraw now rather than
            // leaving the old photo up until the next interval tick.
            onApplied: restartPhotoFrame,
          },
        ],
        [
          "photoFormat",
          {
            applyPayload: ({ deviceId, payload }) => {
              const setting =
                parsePhotoFormatSetting(payload)
              if (setting === null) {
                return null
              }
              deviceConfigStore.setPhotoFormat({
                deviceId,
                format: setting,
              })
              return PHOTO_FORMAT_OPTION_BY_SETTING[setting]
            },
            getHasValue: (deviceId) =>
              deviceConfigStore.getPhotoFormat(deviceId) !==
              undefined,
            onApplied: async (deviceId) => {
              await pushController.pushDevice(deviceId)
            },
          },
        ],
        [
          // 0 = inherit the global default (a number entity always has a
          // value, so 0 is the "unset" sentinel).
          "photoQuality",
          {
            applyPayload: ({ deviceId, payload }) => {
              const quality = parseBoundedInteger({
                payload,
                min: 0,
                max: 100,
              })
              if (quality === null) {
                return null
              }
              deviceConfigStore.setPhotoQuality({
                deviceId,
                quality,
              })
              return String(quality)
            },
            getHasValue: (deviceId) =>
              deviceConfigStore.getPhotoQuality(
                deviceId,
              ) !== undefined,
            onApplied: async (deviceId) => {
              await pushController.pushDevice(deviceId)
            },
          },
        ],
        [
          "clockTimezone",
          {
            applyPayload: ({ deviceId, payload }) => {
              deviceConfigStore.setClockTimezone({
                deviceId,
                timezone: payload.trim(),
              })
              return payload.trim()
            },
            getHasValue: (deviceId) =>
              Boolean(
                deviceConfigStore.getClockTimezone(
                  deviceId,
                ),
              ),
            onApplied: async (deviceId) => {
              await pushController.pushDevice(deviceId)
            },
          },
        ],
        [
          "clockTimeFormat",
          {
            applyPayload: ({ deviceId, payload }) => {
              const setting =
                parseClockTimeFormatSetting(payload)
              if (setting === null) {
                return null
              }
              deviceConfigStore.setClockTimeFormat({
                deviceId,
                setting,
              })
              return CLOCK_TIME_FORMAT_OPTION_BY_SETTING[
                setting
              ]
            },
            getHasValue: (deviceId) =>
              deviceConfigStore.getClockTimeFormat(
                deviceId,
              ) !== undefined,
            onApplied: async (deviceId) => {
              await pushController.pushDevice(deviceId)
            },
          },
        ],
        [
          "clockDateStyle",
          {
            applyPayload: ({ deviceId, payload }) => {
              const setting =
                parseClockDateStyleSetting(payload)
              if (setting === null) {
                return null
              }
              deviceConfigStore.setClockDateStyle({
                deviceId,
                setting,
              })
              return CLOCK_DATE_STYLE_OPTION_BY_SETTING[
                setting
              ]
            },
            getHasValue: (deviceId) =>
              deviceConfigStore.getClockDateStyle(
                deviceId,
              ) !== undefined,
            onApplied: async (deviceId) => {
              await pushController.pushDevice(deviceId)
            },
          },
        ],
        [
          "dither",
          {
            applyPayload: ({ deviceId, payload }) => {
              if (!getIsDitherAlgorithm(payload)) {
                return null
              }
              deviceConfigStore.setDitherAlgorithm({
                deviceId,
                algorithm: payload,
              })
              return payload
            },
            getHasValue: (deviceId) =>
              Boolean(
                deviceConfigStore.getDitherAlgorithm(
                  deviceId,
                ),
              ),
            onApplied: async (deviceId) => {
              await pushController.pushDevice(deviceId)
            },
          },
        ],
        [
          "rotation",
          {
            applyPayload: ({ deviceId, payload }) => {
              const rotation = parseRotation(payload)
              if (rotation === null) {
                return null
              }
              deviceConfigStore.setRotationOverride({
                deviceId,
                rotation,
              })
              return String(rotation)
            },
            getHasValue: (deviceId) =>
              deviceConfigStore.getRotationOverride(
                deviceId,
              ) !== undefined,
            onApplied: async (deviceId) => {
              await pushController.pushDevice(deviceId)
            },
          },
        ],
        [
          "colorMode",
          {
            applyPayload: ({ deviceId, payload }) => {
              if (
                payload !== "Color" &&
                payload !== "Black & White"
              ) {
                return null
              }
              deviceConfigStore.setColorModeOverride({
                deviceId,
                colorMode:
                  payload === "Color" ? "color" : "bw",
              })
              return payload
            },
            getHasValue: (deviceId) =>
              deviceConfigStore.getColorModeOverride(
                deviceId,
              ) !== undefined,
            onApplied: async (deviceId) => {
              await pushController.pushDevice(deviceId)
            },
          },
        ],
        [
          "brightness",
          {
            applyPayload: ({ deviceId, payload }) => {
              const percent = parsePercentPayload(payload)
              if (percent === null) {
                return null
              }
              deviceConfigStore.setBrightnessPercent({
                deviceId,
                percent,
              })
              return String(percent)
            },
            getHasValue: (deviceId) =>
              deviceConfigStore.getBrightnessPercent(
                deviceId,
              ) !== undefined,
            onApplied: async (deviceId) => {
              await pushController.pushDevice(deviceId)
            },
          },
        ],
        [
          "saturation",
          {
            applyPayload: ({ deviceId, payload }) => {
              const percent = parsePercentPayload(payload)
              if (percent === null) {
                return null
              }
              deviceConfigStore.setSaturationPercent({
                deviceId,
                percent,
              })
              return String(percent)
            },
            getHasValue: (deviceId) =>
              deviceConfigStore.getSaturationPercent(
                deviceId,
              ) !== undefined,
            onApplied: async (deviceId) => {
              await pushController.pushDevice(deviceId)
            },
          },
        ],
        // One margin knob per edge — how far the mat overlaps the panel, so
        // every view is laid out inside what is left. Tuned live per device (a
        // reframed / unmatted unit can differ). This never cuts the picture.
        ...MARGIN_EDGES.map(
          (edge): [string, ConfigKnob] => [
            getMarginKnobKind(edge),
            {
              applyPayload: ({ deviceId, payload }) => {
                const pixels = parsePixelPayload(payload)
                if (pixels === null) {
                  return null
                }
                deviceConfigStore.setMarginEdge({
                  deviceId,
                  edge,
                  pixels,
                })
                return String(pixels)
              },
              getHasValue: (deviceId) =>
                deviceConfigStore.getMarginEdge({
                  deviceId,
                  edge,
                }) !== undefined,
              onApplied: async (deviceId) => {
                await pushController.pushDevice(deviceId)
              },
            },
          ],
        ),
        // One photo-crop knob per edge — how much of the picture to throw away
        // so the rest fills the frame. Photo views only; 0 = keep everything.
        ...PHOTO_CROP_EDGES.map(
          (edge): [string, ConfigKnob] => [
            getPhotoCropKnobKind(edge),
            {
              applyPayload: ({ deviceId, payload }) => {
                const pixels = parsePixelPayload(payload)
                if (pixels === null) {
                  return null
                }
                deviceConfigStore.setPhotoCropEdge({
                  deviceId,
                  edge,
                  pixels,
                })
                return String(pixels)
              },
              getHasValue: (deviceId) =>
                deviceConfigStore.getPhotoCropEdge({
                  deviceId,
                  edge,
                }) !== undefined,
              // Re-cut the picture already on screen. The composed PNG is
              // cached, so a plain re-push would keep showing the old framing
              // until the next photo rotation, and the knob would look broken.
              onApplied: async (deviceId) => {
                if (photoFrameAdapter) {
                  await photoFrameAdapter.recomposeCurrentPhoto(
                    deviceId,
                  )
                  return
                }
                await pushController.pushDevice(deviceId)
              },
            },
          ],
        ),
        [
          // Master pause. Deliberately per-device ONLY — no global counterpart.
          // Every other knob is a household *default* a display may override,
          // but a pause is a live, per-room signal (Home Assistant drives it
          // off that room's lights), and a global default would make
          // precedence ambiguous: does a house-wide OFF beat a per-device ON?
          // See docs/decisions/ for the pause-switch record.
          "updates",
          {
            applyPayload: ({ deviceId, payload }) => {
              const isEnabled = parseSwitchPayload(payload)
              if (isEnabled === null) {
                return null
              }
              deviceConfigStore.setIsUpdatesEnabled({
                deviceId,
                isEnabled,
              })
              return isEnabled ? "ON" : "OFF"
            },
            getHasValue: (deviceId) =>
              deviceConfigStore.getHasUpdatesEnabledValue(
                deviceId,
              ),
            onApplied: async (deviceId) => {
              // Resuming must repaint at once, or a clock view would sit on a
              // stale time until the next minute tick. pushDevice self-guards,
              // so this is a no-op when the switch was just turned OFF.
              await pushController.pushDevice(deviceId)
            },
          },
        ],
      ])

    /** Knob kind → its command/state topics for one device. */
    const getKnobTopics = ({
      device,
      kind,
    }: {
      device: ConfiguredDevice
      kind: string
    }) => {
      const topics = buildDeviceTopics({
        baseTopic,
        device,
      })
      const byKind: Record<
        string,
        { command: string; state: string }
      > = {
        photoInterval: {
          command: topics.photoIntervalCommand,
          state: topics.photoIntervalState,
        },
        photoRecency: {
          command: topics.photoRecencyCommand,
          state: topics.photoRecencyState,
        },
        photoFormat: {
          command: topics.photoFormatCommand,
          state: topics.photoFormatState,
        },
        photoQuality: {
          command: topics.photoQualityCommand,
          state: topics.photoQualityState,
        },
        photoPeople: {
          command: topics.photoPeopleCommand,
          state: topics.photoPeopleState,
        },
        photoPeopleMinimum: {
          command: topics.photoPeopleMinimumCommand,
          state: topics.photoPeopleMinimumState,
        },
        photoQuery: {
          command: topics.photoQueryCommand,
          state: topics.photoQueryState,
        },
        clockTimezone: {
          command: topics.clockTimezoneCommand,
          state: topics.clockTimezoneState,
        },
        clockTimeFormat: {
          command: topics.clockTimeFormatCommand,
          state: topics.clockTimeFormatState,
        },
        clockDateStyle: {
          command: topics.clockDateStyleCommand,
          state: topics.clockDateStyleState,
        },
        dither: {
          command: topics.ditherCommand,
          state: topics.ditherState,
        },
        rotation: {
          command: topics.rotationCommand,
          state: topics.rotationState,
        },
        colorMode: {
          command: topics.colorModeCommand,
          state: topics.colorModeState,
        },
        brightness: {
          command: topics.brightnessCommand,
          state: topics.brightnessState,
        },
        saturation: {
          command: topics.saturationCommand,
          state: topics.saturationState,
        },
        margin_top: {
          command: topics.marginTopCommand,
          state: topics.marginTopState,
        },
        margin_right: {
          command: topics.marginRightCommand,
          state: topics.marginRightState,
        },
        margin_bottom: {
          command: topics.marginBottomCommand,
          state: topics.marginBottomState,
        },
        margin_left: {
          command: topics.marginLeftCommand,
          state: topics.marginLeftState,
        },
        photo_crop_top: {
          command: topics.photoCropTopCommand,
          state: topics.photoCropTopState,
        },
        photo_crop_right: {
          command: topics.photoCropRightCommand,
          state: topics.photoCropRightState,
        },
        photo_crop_bottom: {
          command: topics.photoCropBottomCommand,
          state: topics.photoCropBottomState,
        },
        photo_crop_left: {
          command: topics.photoCropLeftCommand,
          state: topics.photoCropLeftState,
        },
        updates: {
          command: topics.updatesCommand,
          state: topics.updatesState,
        },
      }
      return byKind[kind]
    }

    type TopicRoute = {
      /** "" for server-wide (global) topics. */
      deviceId: string
      kind:
        | "refresh"
        | "view"
        | "viewRestore"
        | "photoNext"
        | "photoPrevious"
        | "nowPlayingData"
        | "weatherData"
        | "agendaData"
        | "knob"
        | "globalKnob"
      /** Set when kind is "knob" or "globalKnob". */
      knobKind?: string
      /** True for a knob's retained-state (boot restore) topic. */
      isRestore?: boolean
    }

    const globalTopics = buildGlobalTopics(baseTopic)

    // The server-wide ("Inkcast Server" device) config knobs — the household
    // defaults each display inherits unless it sets its own override. Same
    // command/retained-state/restore shape as the per-device knobs.
    type GlobalConfigKnob = {
      command: string
      state: string
      /** Store the (valid) payload; returns the normalized retained-state payload, or null to reject. */
      applyPayload: (payload: string) => string | null
      getHasValue: () => boolean
      /** Re-render / re-fetch after a change or a boot-time restore. */
      afterChange?: () => void
      /** Retained-state seed for number knobs (avoids HA showing "unknown"). */
      seedDefault?: string
    }

    const globalConfigKnobs: ReadonlyMap<
      string,
      GlobalConfigKnob
    > = new Map([
      [
        "photoInterval",
        {
          command: globalTopics.photoIntervalCommand,
          state: globalTopics.photoIntervalState,
          applyPayload: (payload) => {
            const minutes = parseBoundedInteger({
              payload,
              min: 1,
              max: 1440,
            })
            if (minutes === null) {
              return null
            }
            deviceConfigStore.setGlobalPhotoIntervalMinutes(
              minutes,
            )
            return String(minutes)
          },
          getHasValue: () =>
            deviceConfigStore.getGlobalPhotoIntervalMinutes() !==
            undefined,
          seedDefault: String(
            DEFAULT_PHOTO_INTERVAL_MINUTES,
          ),
        },
      ],
      [
        "photoRecency",
        {
          command: globalTopics.photoRecencyCommand,
          state: globalTopics.photoRecencyState,
          applyPayload: (payload) => {
            const days = parseBoundedInteger({
              payload,
              min: 1,
              max: 3650,
            })
            if (days === null) {
              return null
            }
            deviceConfigStore.setGlobalPhotoRecencyHalfLifeDays(
              days,
            )
            return String(days)
          },
          getHasValue: () =>
            deviceConfigStore.getGlobalPhotoRecencyHalfLifeDays() !==
            undefined,
          seedDefault: String(
            DEFAULT_PHOTO_RECENCY_HALF_LIFE_DAYS,
          ),
        },
      ],
      [
        "photoPeopleMinimum",
        {
          command: globalTopics.photoPeopleMinimumCommand,
          state: globalTopics.photoPeopleMinimumState,
          applyPayload: (payload) => {
            const minimum = parseBoundedInteger({
              payload,
              min: 1,
              max: 20,
            })
            if (minimum === null) {
              return null
            }
            deviceConfigStore.setGlobalPhotoPeopleMinimum(
              minimum,
            )
            return String(minimum)
          },
          getHasValue: () =>
            deviceConfigStore.getGlobalPhotoPeopleMinimum() !==
            undefined,
          seedDefault: String(DEFAULT_PEOPLE_MINIMUM),
        },
      ],
      [
        "photoFormat",
        {
          command: globalTopics.photoFormatCommand,
          state: globalTopics.photoFormatState,
          applyPayload: (payload) => {
            const setting = parsePhotoFormatSetting(payload)
            // The global default has no "Auto" — it IS the root default.
            if (setting === null || setting === "auto") {
              return null
            }
            deviceConfigStore.setGlobalPhotoFormat(setting)
            return PHOTO_FORMAT_OPTION_BY_SETTING[setting]
          },
          getHasValue: () =>
            deviceConfigStore.getGlobalPhotoFormat() !==
            undefined,
          afterChange: refreshAllPhotoFrameDevices,
          seedDefault:
            PHOTO_FORMAT_OPTION_BY_SETTING[
              DEFAULT_PHOTO_FORMAT
            ],
        },
      ],
      [
        "photoQuality",
        {
          command: globalTopics.photoQualityCommand,
          state: globalTopics.photoQualityState,
          applyPayload: (payload) => {
            const quality = parseBoundedInteger({
              payload,
              min: 1,
              max: 100,
            })
            if (quality === null) {
              return null
            }
            deviceConfigStore.setGlobalPhotoQuality(quality)
            return String(quality)
          },
          getHasValue: () =>
            deviceConfigStore.getGlobalPhotoQuality() !==
            undefined,
          afterChange: refreshAllPhotoFrameDevices,
          seedDefault: String(DEFAULT_PHOTO_QUALITY),
        },
      ],
      [
        "clockTimezone",
        {
          command: globalTopics.clockTimezoneCommand,
          state: globalTopics.clockTimezoneState,
          applyPayload: (payload) => {
            deviceConfigStore.setGlobalClockTimezone(
              payload.trim(),
            )
            return payload.trim()
          },
          getHasValue: () =>
            Boolean(
              deviceConfigStore.getGlobalClockTimezone(),
            ),
          afterChange: () => {
            pushDevicesShowingView({
              getIsViewIncluded: getIsClockBearingView,
            })
          },
        },
      ],
      [
        "clockTimeFormat",
        {
          command: globalTopics.clockTimeFormatCommand,
          state: globalTopics.clockTimeFormatState,
          applyPayload: (payload) => {
            const setting =
              parseClockTimeFormatSetting(payload)
            // The global default has no "Auto" — it IS the root default.
            if (setting === null || setting === "auto") {
              return null
            }
            deviceConfigStore.setGlobalClockTimeFormat(
              setting,
            )
            return CLOCK_TIME_FORMAT_OPTION_BY_SETTING[
              setting
            ]
          },
          getHasValue: () =>
            deviceConfigStore.getGlobalClockTimeFormat() !==
            undefined,
          afterChange: () => {
            pushDevicesShowingView({
              getIsViewIncluded: getIsClockBearingView,
            })
          },
          seedDefault:
            CLOCK_TIME_FORMAT_OPTION_BY_SETTING[
              DEFAULT_CLOCK_TIME_FORMAT
            ],
        },
      ],
      [
        "clockDateStyle",
        {
          command: globalTopics.clockDateStyleCommand,
          state: globalTopics.clockDateStyleState,
          applyPayload: (payload) => {
            const setting =
              parseClockDateStyleSetting(payload)
            if (setting === null || setting === "auto") {
              return null
            }
            deviceConfigStore.setGlobalClockDateStyle(
              setting,
            )
            return CLOCK_DATE_STYLE_OPTION_BY_SETTING[
              setting
            ]
          },
          getHasValue: () =>
            deviceConfigStore.getGlobalClockDateStyle() !==
            undefined,
          afterChange: () => {
            pushDevicesShowingView({
              getIsViewIncluded: getIsClockBearingView,
            })
          },
          seedDefault:
            CLOCK_DATE_STYLE_OPTION_BY_SETTING[
              DEFAULT_CLOCK_DATE_STYLE
            ],
        },
      ],
    ])

    const commandRoutes = new Map<string, TopicRoute>()
    config.devices.forEach((device) => {
      const topics = buildDeviceTopics({
        baseTopic,
        device,
      })
      commandRoutes.set(topics.refreshCommand, {
        deviceId: device.id,
        kind: "refresh",
      })
      commandRoutes.set(topics.viewCommand, {
        deviceId: device.id,
        kind: "view",
      })
      // The retained view state restores the pre-restart selection.
      commandRoutes.set(topics.viewState, {
        deviceId: device.id,
        kind: "viewRestore",
      })
      commandRoutes.set(topics.photoNextCommand, {
        deviceId: device.id,
        kind: "photoNext",
      })
      commandRoutes.set(topics.photoPreviousCommand, {
        deviceId: device.id,
        kind: "photoPrevious",
      })
      // HA pushes this display's view data (retained) to these topics.
      commandRoutes.set(topics.nowPlayingDataCommand, {
        deviceId: device.id,
        kind: "nowPlayingData",
      })
      commandRoutes.set(topics.weatherDataCommand, {
        deviceId: device.id,
        kind: "weatherData",
      })
      commandRoutes.set(topics.agendaDataCommand, {
        deviceId: device.id,
        kind: "agendaData",
      })
      Array.from(configKnobs.keys()).forEach((knobKind) => {
        const knobTopics = getKnobTopics({
          device,
          kind: knobKind,
        })
        commandRoutes.set(knobTopics.command, {
          deviceId: device.id,
          kind: "knob",
          knobKind,
          isRestore: false,
        })
        commandRoutes.set(knobTopics.state, {
          deviceId: device.id,
          kind: "knob",
          knobKind,
          isRestore: true,
        })
      })
    })

    // Server-wide ("Inkcast Server" device) knobs: the household defaults any
    // display inherits unless it overrides them. Retained state doubles as
    // boot-time restore.
    Array.from(globalConfigKnobs.entries()).forEach(
      ([knobKind, globalKnob]) => {
        commandRoutes.set(globalKnob.command, {
          deviceId: "",
          kind: "globalKnob",
          knobKind,
          isRestore: false,
        })
        commandRoutes.set(globalKnob.state, {
          deviceId: "",
          kind: "globalKnob",
          knobKind,
          isRestore: true,
        })
      },
    )

    await publisher.subscribe({
      topics: Array.from(commandRoutes.keys()),
      handler: async ({ topic, payload }) => {
        const route = commandRoutes.get(topic)
        if (!route) {
          return
        }

        if (route.kind === "refresh") {
          await pushController.pushDevice(route.deviceId)
          return
        }
        if (route.kind === "globalKnob") {
          const globalKnob = route.knobKind
            ? globalConfigKnobs.get(route.knobKind)
            : undefined
          if (!globalKnob) {
            return
          }
          if (route.isRestore) {
            // Boot-time restore from the retained state topic (only if nothing
            // set this run).
            if (
              !globalKnob.getHasValue() &&
              globalKnob.applyPayload(payload) !== null
            ) {
              globalKnob.afterChange?.()
            }
            return
          }
          const normalizedPayload =
            globalKnob.applyPayload(payload)
          if (normalizedPayload === null) {
            return
          }
          await publisher.publish({
            topic: globalKnob.state,
            payload: normalizedPayload,
            isRetained: true,
          })
          globalKnob.afterChange?.()
          return
        }
        if (route.kind === "view") {
          if (getIsViewName(payload)) {
            if (
              getIsPhotoView(payload) &&
              photoFrameAdapter
            ) {
              // Switching into a Photo Frame view must (re)fetch using the
              // already-configured people/query — a bare push would only
              // repaint stale/absent bytes and wrongly show the "configure
              // in Home Assistant" placeholder. forceRefresh recomposes for the
              // newly selected view even if a photo (fit for the old view) is
              // cached.
              deviceStore.setActiveView({
                deviceId: route.deviceId,
                viewName: payload,
              })
              await photoFrameAdapter.showPhotoFrame({
                deviceId: route.deviceId,
                isForcedRefresh: true,
              })
            } else {
              // Every other view (including Clock (Agenda), whose data arrives
              // on the retained `agenda/set` topic) just renders what's known.
              await pushController.setView({
                deviceId: route.deviceId,
                viewName: payload,
              })
            }
          }
          return
        }
        if (route.kind === "viewRestore") {
          // Boot-time restore of the last selection from the retained
          // topic; explicit selections made this run always win.
          if (
            getIsViewName(payload) &&
            !deviceStore.getHasExplicitView(
              route.deviceId,
            ) &&
            payload !==
              deviceStore.getActiveView(route.deviceId)
          ) {
            deviceStore.setActiveView({
              deviceId: route.deviceId,
              viewName: payload,
              isExplicit: false,
            })
            if (
              getIsPhotoView(payload) &&
              photoFrameAdapter
            ) {
              // Boot-time restore into a Photo Frame view: fetch straight away
              // instead of waiting up to a full interval tick, so the panel
              // never shows the placeholder while people/query are set.
              await photoFrameAdapter.showPhotoFrame({
                deviceId: route.deviceId,
              })
            } else {
              await pushController.pushDevice(
                route.deviceId,
              )
            }
          }
          return
        }
        if (route.kind === "photoNext") {
          await photoFrameAdapter?.showNextPhoto(
            route.deviceId,
          )
          return
        }
        if (route.kind === "photoPrevious") {
          await photoFrameAdapter?.showPreviousPhoto(
            route.deviceId,
          )
          return
        }
        if (route.kind === "nowPlayingData") {
          await applyNowPlayingPayload({
            deviceId: route.deviceId,
            payload,
          })
          return
        }
        if (route.kind === "weatherData") {
          applyWeatherPayload({
            deviceId: route.deviceId,
            payload,
          })
          return
        }
        if (route.kind === "agendaData") {
          applyAgendaPayload({
            deviceId: route.deviceId,
            payload,
          })
          return
        }

        const knobKind = route.knobKind
        if (!knobKind) {
          return
        }
        const knob = configKnobs.get(knobKind)
        const device = pushController.deviceById.get(
          route.deviceId,
        )
        if (!knob || !device) {
          return
        }
        if (route.isRestore) {
          if (!knob.getHasValue(route.deviceId)) {
            knob.applyPayload({
              deviceId: route.deviceId,
              payload,
            })
          }
          return
        }
        const normalizedPayload = knob.applyPayload({
          deviceId: route.deviceId,
          payload,
        })
        if (normalizedPayload === null) {
          return
        }
        await publisher.publish({
          topic: getKnobTopics({
            device,
            kind: knobKind,
          }).state,
          payload: normalizedPayload,
          isRetained: true,
        })
        await knob.onApplied?.(route.deviceId)
      },
    })

    // Both of the jobs below wait out the retained replay.
    //
    // MQTT gives no "retained messages finished" signal, so the only honest
    // way to read Home Assistant's saved `view`, `updates` and knob values is
    // to let them land first. Acting sooner is what pushed a first frame to two
    // displays the owner had paused: the boot push read the defaults
    // (updates = on, the default view), spent 15 s in a cold Chromium render,
    // and published just as the real values arrived.
    //
    // `pushDevice` also re-checks both AFTER its render, so a late arrival is
    // caught even if it beats this window. This delay is what stops the wasted
    // render; that re-check is what makes it correct.
    setTimeout(() => {
      // Populate each HA image entity with a first frame. Not awaited: the
      // image topic is retained, so a panel is already showing its last frame
      // and nothing downstream needs this to finish.
      void Promise.all(
        config.devices.map((device) =>
          pushController.pushDevice(device.id),
        ),
      )

      // Seed the config entities' retained state with defaults for devices
      // with no retained value yet.
      config.devices.forEach((device) => {
        const seedPairs: readonly {
          kind: string
          hasValue: boolean
          payload: string
        }[] = [
          {
            kind: "dither",
            hasValue: Boolean(
              deviceConfigStore.getDitherAlgorithm(
                device.id,
              ),
            ),
            payload: device.ditherProfile.algorithm,
          },
          {
            kind: "rotation",
            hasValue:
              deviceConfigStore.getRotationOverride(
                device.id,
              ) !== undefined,
            payload: String(device.rotation),
          },
          ...(device.colorMode === "spectra6"
            ? [
                {
                  kind: "colorMode",
                  hasValue:
                    deviceConfigStore.getColorModeOverride(
                      device.id,
                    ) !== undefined,
                  payload: "Color",
                },
              ]
            : []),
          {
            kind: "brightness",
            hasValue:
              deviceConfigStore.getBrightnessPercent(
                device.id,
              ) !== undefined,
            payload: "100",
          },
          {
            kind: "saturation",
            hasValue:
              deviceConfigStore.getSaturationPercent(
                device.id,
              ) !== undefined,
            payload: "100",
          },
          ...MARGIN_EDGES.map((edge) => ({
            kind: getMarginKnobKind(edge),
            hasValue:
              deviceConfigStore.getMarginEdge({
                deviceId: device.id,
                edge,
              }) !== undefined,
            payload: "0",
          })),
          ...PHOTO_CROP_EDGES.map((edge) => ({
            kind: getPhotoCropKnobKind(edge),
            hasValue:
              deviceConfigStore.getPhotoCropEdge({
                deviceId: device.id,
                edge,
              }) !== undefined,
            payload: "0",
          })),
          // Per-device Photo Frame overrides default to 0 (= inherit global).
          {
            kind: "photoInterval",
            hasValue:
              deviceConfigStore.getPhotoIntervalMinutes(
                device.id,
              ) !== undefined,
            payload: "0",
          },
          {
            kind: "photoRecency",
            hasValue:
              deviceConfigStore.getPhotoRecencyHalfLifeDays(
                device.id,
              ) !== undefined,
            payload: "0",
          },
          {
            kind: "photoPeopleMinimum",
            hasValue:
              deviceConfigStore.getPhotoPeopleMinimum(
                device.id,
              ) !== undefined,
            payload: "0",
          },
          // Per-device format defaults to "Auto" (inherit global); quality to
          // 0 (= inherit global).
          {
            kind: "photoFormat",
            hasValue:
              deviceConfigStore.getPhotoFormat(
                device.id,
              ) !== undefined,
            payload: "Auto",
          },
          {
            kind: "photoQuality",
            hasValue:
              deviceConfigStore.getPhotoQuality(
                device.id,
              ) !== undefined,
            payload: "0",
          },
          // Photo Frame people: seeded from the device registry so a retained
          // wipe can't strand the frame on the empty-filter placeholder. Only
          // devices that declare a default take part; HA owns the live value.
          ...(device.photoPeople &&
          device.photoPeople.length > 0
            ? [
                {
                  kind: "photoPeople",
                  hasValue: Boolean(
                    deviceConfigStore.getPhotoPeople(
                      device.id,
                    ),
                  ),
                  payload: device.photoPeople.join(", "),
                },
              ]
            : []),
          // Per-device clock format/style default to "Auto" (inherit global).
          {
            kind: "clockTimeFormat",
            hasValue:
              deviceConfigStore.getClockTimeFormat(
                device.id,
              ) !== undefined,
            payload: "Auto",
          },
          {
            kind: "clockDateStyle",
            hasValue:
              deviceConfigStore.getClockDateStyle(
                device.id,
              ) !== undefined,
            payload: "Auto",
          },
          {
            // Seed ON so a fresh install shows a real switch state rather than
            // "unknown", and — because the retained state topic IS the
            // persistence — a display is never left silently paused by a
            // server restart it can't report.
            kind: "updates",
            hasValue:
              deviceConfigStore.getHasUpdatesEnabledValue(
                device.id,
              ),
            payload: "ON",
          },
        ]
        seedPairs
          .filter((seedPair) => !seedPair.hasValue)
          .forEach((seedPair) => {
            publisher
              .publish({
                topic: getKnobTopics({
                  device,
                  kind: seedPair.kind,
                }).state,
                payload: seedPair.payload,
                isRetained: true,
              })
              .catch(() => {})
          })
      })

      // Seed the server-wide number knobs (Inkcast Server device) so HA shows
      // a concrete default instead of "unknown".
      Array.from(globalConfigKnobs.values())
        .filter(
          (
            globalKnob,
          ): globalKnob is GlobalConfigKnob & {
            seedDefault: string
          } =>
            globalKnob.seedDefault !== undefined &&
            !globalKnob.getHasValue(),
        )
        .forEach((globalKnob) => {
          publisher
            .publish({
              topic: globalKnob.state,
              payload: globalKnob.seedDefault,
              isRetained: true,
            })
            .catch(() => {})
        })
    }, RETAINED_SETTLE_MILLISECONDS)
  }

  // Browser-mode (Slatecast) devices: HA discovery + MQTT routes + the
  // /d/<id> pages and their WebSocket hub. Fully isolated from the image
  // pipeline above.
  const browserMode = createBrowserMode({
    config,
    publisher,
    getGlobalClockConfig,
  })
  await browserMode.start()

  const app = createApp({
    platform,
    config,
    deviceStore,
    deviceDefinitionStore,
    getDeviceSettings: (deviceId) => {
      const device = pushController.deviceById.get(deviceId)
      if (!device) {
        // Not an image device: a browser device answers with its own knobs.
        return browserMode.getDeviceSettings(deviceId)
      }
      return {
        photoPeople:
          deviceConfigStore.getPhotoPeople(deviceId),
        photoQuery:
          deviceConfigStore.getPhotoQuery(deviceId),
        photoInterval: String(
          deviceConfigStore.getPhotoIntervalMinutes(
            deviceId,
          ) ?? 0,
        ),
        photoRecency: String(
          deviceConfigStore.getPhotoRecencyHalfLifeDays(
            deviceId,
          ) ?? 0,
        ),
        photoPeopleMinimum: String(
          deviceConfigStore.getPhotoPeopleMinimum(
            deviceId,
          ) ?? 0,
        ),
        photoFormat:
          deviceConfigStore.getPhotoFormat(deviceId) ??
          "Auto",
        photoQuality: String(
          deviceConfigStore.getPhotoQuality(deviceId) ?? 0,
        ),
        clockTimezone:
          deviceConfigStore.getClockTimezone(deviceId),
        clockTimeFormat:
          CLOCK_TIME_FORMAT_OPTION_BY_SETTING[
            deviceConfigStore.getClockTimeFormat(
              deviceId,
            ) ?? "auto"
          ],
        clockDateStyle:
          CLOCK_DATE_STYLE_OPTION_BY_SETTING[
            deviceConfigStore.getClockDateStyle(deviceId) ??
              "auto"
          ],
        dither:
          deviceConfigStore.getDitherAlgorithm(deviceId) ??
          device.ditherProfile.algorithm,
        rotation: String(
          deviceConfigStore.getRotationOverride(deviceId) ??
            device.rotation,
        ),
        ...(device.colorMode === "spectra6"
          ? {
              colorMode:
                deviceConfigStore.getColorModeOverride(
                  deviceId,
                ) === "bw"
                  ? "Black & White"
                  : "Color",
            }
          : {}),
        brightness: String(
          deviceConfigStore.getBrightnessPercent(
            deviceId,
          ) ?? 100,
        ),
        saturation: String(
          deviceConfigStore.getSaturationPercent(
            deviceId,
          ) ?? 100,
        ),
        margin_top: String(
          deviceConfigStore.getMarginEdge({
            deviceId,
            edge: "top",
          }) ?? 0,
        ),
        margin_right: String(
          deviceConfigStore.getMarginEdge({
            deviceId,
            edge: "right",
          }) ?? 0,
        ),
        margin_bottom: String(
          deviceConfigStore.getMarginEdge({
            deviceId,
            edge: "bottom",
          }) ?? 0,
        ),
        margin_left: String(
          deviceConfigStore.getMarginEdge({
            deviceId,
            edge: "left",
          }) ?? 0,
        ),
        photo_crop_top: String(
          deviceConfigStore.getPhotoCropEdge({
            deviceId,
            edge: "top",
          }) ?? 0,
        ),
        photo_crop_right: String(
          deviceConfigStore.getPhotoCropEdge({
            deviceId,
            edge: "right",
          }) ?? 0,
        ),
        photo_crop_bottom: String(
          deviceConfigStore.getPhotoCropEdge({
            deviceId,
            edge: "bottom",
          }) ?? 0,
        ),
        photo_crop_left: String(
          deviceConfigStore.getPhotoCropEdge({
            deviceId,
            edge: "left",
          }) ?? 0,
        ),
        updates: deviceConfigStore.getIsUpdatesEnabled(
          deviceId,
        )
          ? "ON"
          : "OFF",
      }
    },
    onDeviceDefinitionsChanged: () => {
      setTimeout(() => {
        process.kill(process.pid, "SIGTERM")
      }, 100)
    },
    pushController,
    renderTokenStore,
    setDeviceSetting: async ({
      deviceId,
      kind,
      payload,
    }) => {
      const device = pushController.deviceById.get(deviceId)
      if (!device) {
        return browserMode.setDeviceSetting({
          deviceId,
          kind,
          payload,
        })
      }
      const commandTopicByKind: Record<string, string> = {
        photoPeople: "photoPeopleCommand",
        photoQuery: "photoQueryCommand",
        photoInterval: "photoIntervalCommand",
        photoRecency: "photoRecencyCommand",
        photoPeopleMinimum: "photoPeopleMinimumCommand",
        photoFormat: "photoFormatCommand",
        photoQuality: "photoQualityCommand",
        clockTimezone: "clockTimezoneCommand",
        clockTimeFormat: "clockTimeFormatCommand",
        clockDateStyle: "clockDateStyleCommand",
        dither: "ditherCommand",
        rotation: "rotationCommand",
        colorMode: "colorModeCommand",
        brightness: "brightnessCommand",
        saturation: "saturationCommand",
        margin_top: "marginTopCommand",
        margin_right: "marginRightCommand",
        margin_bottom: "marginBottomCommand",
        margin_left: "marginLeftCommand",
        photo_crop_top: "photoCropTopCommand",
        photo_crop_right: "photoCropRightCommand",
        photo_crop_bottom: "photoCropBottomCommand",
        photo_crop_left: "photoCropLeftCommand",
        updates: "updatesCommand",
      }
      const commandKey = commandTopicByKind[kind]
      if (!commandKey || !publisher.isEnabled) {
        return false
      }
      const topics = buildDeviceTopics({
        baseTopic,
        device,
      }) as Record<string, string>
      await publisher.publish({
        topic: topics[commandKey] ?? "",
        payload,
        isRetained: false,
      })
      return true
    },
  })
  const { injectWebSocket, upgradeWebSocket } =
    browserMode.attach(app, {
      getPlatformScreenId: (deviceId) =>
        platform.store.get().deviceScreens[deviceId],
    })
  attachPlatformSockets({ app, platform, upgradeWebSocket })
  const assignments = {
    value: JSON.stringify(
      platform.store.get().deviceScreens,
    ),
  }
  platform.subscribe(() => {
    const current = JSON.stringify(
      platform.store.get().deviceScreens,
    )
    if (current !== assignments.value) {
      const previous = JSON.parse(
        assignments.value,
      ) as Record<string, string>
      new Set([
        ...Object.keys(previous),
        ...Object.keys(platform.store.get().deviceScreens),
      ]).forEach((deviceId) => {
        browserMode.reloadDevice(deviceId)
      })
      assignments.value = current
    }
  })
  const server = serve({
    fetch: app.fetch,
    port: config.port,
  })
  injectWebSocket(server)
  const platformImageScheduler =
    createPlatformImageScheduler({
      platform,
      deviceIds: config.devices.map((device) => device.id),
      push: pushController.pushDevice,
    })
  console.log(
    `[castkit] serving on :${config.port} (engine=${config.renderEngine}, mqtt=${publisher.isEnabled ? "on" : "off"}, imageDevices=${config.devices.length}, browserDevices=${browserMode.deviceCount})`,
  )

  const shutdown = async () => {
    console.log("[inkcast] shutting down")
    server.close()
    platformImageScheduler.dispose()
    platform.dispose()
    clockTicker.close()
    photoFrameAdapter?.close()
    renderTokenStore.stopSweeper()
    await publisher.close()
    await renderService.close()
    process.exit(0)
  }

  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
