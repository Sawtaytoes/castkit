import type {
  ChannelSnapshot,
  ContractData,
} from "@castkit/sdk/contracts"
import type { SourceAction } from "@castkit/sdk/plugin"
import type { MqttPublisher } from "@castkit/shared/mqtt/publisher"
import {
  parseDeviceCommand,
  SPOOL_COMMAND_ACTIONS,
} from "@castkit/shared/protocol/commands"
import type {
  BrowserClockConfig,
  BrowserDeviceSettings,
  BrowserExternalView,
  ServerToClientMessage,
  ViewDataState,
} from "@castkit/shared/protocol/ws"
import {
  parseAgendaPayload,
  parseNowPlayingPayload,
  parsePrintersPayload,
  parseQueuePayload,
  parseWeatherPayload,
} from "@castkit/shared/viewData/parsers"
import { createStaticHandler } from "@charcuterie/server"
import { createNodeWebSocket } from "@hono/node-ws"
import type { Hono } from "hono"
import type {
  BrowserDeviceConfig,
  InkcastConfig,
} from "../config/env.ts"
import {
  buildBrowserDeviceTopics,
  buildBrowserDiscoveryMessages,
  THEME_OPTIONS,
} from "../homeAssistant/browserDiscovery.ts"
import { buildGlobalTopics } from "../homeAssistant/discovery.ts"
import {
  fetchFaceBoxes,
  fetchPreviewJpeg,
  pickRandomAssetId,
  resolvePersonIds,
} from "../immich/immichClient.ts"
import { preparePhotoFrameImage } from "../immich/photoFrameImage.ts"
import { buildPlatformPage } from "../platform/platformPages.ts"
import {
  createPlatformStore,
  type PlatformStore,
} from "../platform/platformStore.ts"
import { createViewDataStore } from "../state/viewDataStore.ts"
import {
  getBrowserViewByName,
  getBrowserViewsForDevice,
} from "../views/browserRegistry.ts"
import { buildAmbientLightData } from "./ambientLightData.ts"
import {
  brightnessToPercent,
  createBrowserBacklightStore,
  parseBacklightBrightnessPayload,
  parseBacklightPercentPayload,
  percentToBrightness,
} from "./browserBacklightStore.ts"
import { resolveBrowserPanelProperties } from "./browserPanelProperties.ts"
import { createBrowserPhotoConfigStore } from "./browserPhotoConfigStore.ts"
import { createBrowserStateStore } from "./browserStateStore.ts"
import { createExternalViewHealth } from "./externalViewHealth.ts"
import { createBrowserHub, type HubSocket } from "./hub.ts"
import {
  buildDevicePageHtml,
  resolveSlatecastBuildId,
  resolveSlatecastDistDir,
} from "./pages.ts"
import { createRemoteAmbientLight } from "./remoteAmbientLight.ts"
import { createRemoteAmbientLightMqtt } from "./remoteAmbientLightMqtt.ts"
import { createRemoteBacklight } from "./remoteBacklight.ts"
import { createRemoteBacklightMqtt } from "./remoteBacklightMqtt.ts"

/**
 * Browser-mode (Slatecast) wiring: HA discovery + MQTT routes for the
 * browser devices, the `/d/<id>` page + WebSocket hub, and the tap→MQTT
 * command bridge. Isolated from the image-mode path in index.ts so the ePaper
 * pipeline never depends on any of this.
 */

const ROTATION_VALUES = [0, 90, 180, 270] as const
type Rotation = (typeof ROTATION_VALUES)[number]

const parseRotationPayload = (
  payload: string,
): Rotation | null => {
  const value = Number.parseInt(payload, 10)
  return (
    ROTATION_VALUES.find(
      (rotation) => rotation === value,
    ) ?? null
  )
}

const parseThemePayload = (payload: string) =>
  THEME_OPTIONS.find((option) => option === payload) ?? null

/** Recency half-life for the browser photo pool (matches the image default). */
const PHOTO_RECENCY_HALF_LIFE_DAYS = 365

/** A positive whole-minute interval, or null when the payload is unusable. */
const parsePhotoIntervalPayload = (
  payload: string,
): number | null => {
  const value = Number.parseInt(payload, 10)
  return Number.isFinite(value) && value >= 1 ? value : null
}

const parseJsonPayload = (payload: string): unknown => {
  try {
    return JSON.parse(payload)
  } catch {
    return undefined
  }
}

export type BrowserMode = ReturnType<
  typeof createBrowserMode
>

/** The slice of the platform the device page reads channels and actions through. */
export type BrowserModePlatform = {
  getDeviceTarget?: (
    deviceId: string,
  ) => { kind: "view" | "screen"; id: string } | undefined
  getTarget?: (target: {
    kind: "view" | "screen"
    id: string
  }) => {
    view: import("@castkit/sdk/contracts").ViewDefinition
  } | null
  store?: PlatformStore
  hub: {
    get: (id: string) => ChannelSnapshot | undefined
    subscribe: (
      listener: (snapshot: ChannelSnapshot) => void,
    ) => () => void
  }
  runtime: {
    executeAction: (
      request: SourceAction,
    ) => Promise<unknown>
  }
}

/**
 * Map a current color mode back to the value a pre-2026-09-14 Slatecast bundle
 * expects. Only used to fill the deprecated `colour` alias in the snapshot.
 */
const toLegacyColor = (
  color: "monochrome" | "grayscale" | "spectra6" | "full",
): "mono" | "greyscale" | "e6" | "full" => {
  switch (color) {
    case "monochrome":
      return "mono"
    case "grayscale":
      return "greyscale"
    case "spectra6":
      return "e6"
    default:
      return "full"
  }
}

export const createBrowserMode = ({
  config,
  publisher,
  getGlobalClockConfig,
  externalViewProbe,
  platform,
}: {
  config: InkcastConfig
  publisher: MqttPublisher
  /**
   * The resolved global clock config (timezone / 12-24h / date style) stamped
   * onto every settings payload so browser clocks match the ePaper devices.
   */
  getGlobalClockConfig: () => BrowserClockConfig
  /** Overrides the external-view health probe's cadence, for tests. */
  externalViewProbe?: {
    intervalMs?: number
    timeoutMs?: number
    fetchHealth?: typeof fetch
  }
  /**
   * The platform's channel cache and source runtime, for the one device-page
   * view whose data is not pushed by Home Assistant: a device's
   * `spoolsChannel` is read from the cache and its spool commands are executed
   * by that channel's source. Optional so a test of the MQTT-fed views needs
   * no platform.
   */
  platform?: BrowserModePlatform
}) => {
  const devices = config.browserDevices
  const { baseTopic } = config.mqtt
  const globalTopics = buildGlobalTopics(baseTopic)
  const stateStore = createBrowserStateStore({ devices })
  const viewDataStore = createViewDataStore()
  const photoConfigStore = createBrowserPhotoConfigStore()
  const backlightStore = createBrowserBacklightStore()
  const controlStore =
    platform?.store ?? createPlatformStore()
  const remoteAmbientLight = createRemoteAmbientLight({
    store: controlStore,
  })
  const ambientLightMqtt = createRemoteAmbientLightMqtt({
    controller: remoteAmbientLight,
    publisher,
    baseTopic,
  })
  const mirrorAmbientLight = (deviceId: string) => {
    void ambientLightMqtt
      .publish({ deviceId })
      .catch(() => {})
  }
  const remoteBacklight = createRemoteBacklight({
    store: controlStore,
    getChannel: (id) => platform?.hub.get(id),
  })
  const remoteBacklightMqtt = createRemoteBacklightMqtt({
    controller: remoteBacklight,
    publisher,
    baseTopic,
  })
  // Persist first and mirror asynchronously: a disconnected broker must never
  // delay a direct hardware control or its management response.
  const mirrorRemoteBacklight = (deviceId: string) => {
    void remoteBacklightMqtt
      .publish({ deviceId })
      .catch(() => {})
  }
  const backlightSubscription = platform?.hub.subscribe(
    (snapshot) => {
      devices
        .filter(
          (device) =>
            device.hasRemoteBacklight &&
            remoteBacklight.get(device.id).channel ===
              snapshot.id,
        )
        .forEach((device) => {
          mirrorRemoteBacklight(device.id)
        })
    },
  )
  // Devices whose backlight agent last reported `online`. A transition INTO
  // online (including the first one seen after server start) is when the
  // stored level is re-sent — that is what survives a panel reboot.
  const backlightOnlineDeviceIds = new Set<string>()
  const immichConfig = config.immich
  const isPhotoFrameEnabled = Boolean(
    immichConfig.url && immichConfig.apiKey,
  )
  // Which per-device knobs were set THIS run (blocks boot-time restore).
  const knobSetByDeviceId = {
    theme: new Set<string>(),
    rotation: new Set<string>(),
    photoPeople: new Set<string>(),
    photoQuery: new Set<string>(),
    photoInterval: new Set<string>(),
    backlight: new Set<string>(),
  }

  const topicsByDeviceId = new Map(
    devices.map((device) => [
      device.id,
      buildBrowserDeviceTopics({
        baseTopic,
        deviceId: device.id,
      }),
    ]),
  )

  const hub = createBrowserHub({
    onConnectionCountChange: ({
      deviceId,
      connectionCount,
    }) => {
      const topics = topicsByDeviceId.get(deviceId)
      if (!topics) {
        return
      }
      publisher
        .publish({
          topic: topics.connected,
          payload: connectionCount > 0 ? "ON" : "OFF",
          isRetained: true,
        })
        .catch(() => {})
    },
  })

  /**
   * The external views as the panel receives them: each health URL replaced by
   * its last answer, so the URL itself never leaves the server.
   */
  const toClientExternalViews = (
    device: BrowserDeviceConfig,
  ): readonly BrowserExternalView[] =>
    device.externalViews.map(({ healthUrl, ...view }) =>
      healthUrl
        ? {
            ...view,
            isAvailable:
              externalViewHealth.getIsAvailable(healthUrl),
          }
        : view,
    )

  const externalViewHealth = createExternalViewHealth({
    ...externalViewProbe,
    healthUrls: devices.flatMap((device) =>
      device.externalViews.flatMap((view) =>
        view.healthUrl ? [view.healthUrl] : [],
      ),
    ),
    onAvailabilityChange: ({ healthUrl }) => {
      devices
        .filter((device) =>
          device.externalViews.some(
            (view) => view.healthUrl === healthUrl,
          ),
        )
        .forEach((device) => {
          hub.broadcast({
            deviceId: device.id,
            message: {
              type: "external_views",
              externalViews: toClientExternalViews(device),
            },
          })
        })
    },
  })

  const readAmbientLightData = (deviceId: string) => {
    const target = platform?.getDeviceTarget?.(deviceId)
    if (!target)
      return buildAmbientLightData({
        data: buildViewDataState(deviceId),
      })
    const view = platform?.getTarget?.(target)?.view
    const snapshots =
      view?.panels
        .flatMap((panel) =>
          Object.values(panel.bindings).map((channelId) =>
            platform?.hub.get(channelId),
          ),
        )
        .filter(
          (snapshot) => snapshot?.status === "ready",
        ) ?? []
    const read = (type: string) =>
      snapshots.find((snapshot) => snapshot?.type === type)
        ?.data
    return buildAmbientLightData({
      data: {
        nowPlaying: read(
          "now-playing.v1",
        ) as ViewDataState["nowPlaying"],
        agenda: read(
          "agenda.v1",
        ) as ViewDataState["agenda"],
        weather: read("weather.v1") as
          | { condition?: string }
          | undefined,
      },
    })
  }

  const buildViewDataState = (
    deviceId: string,
  ): ViewDataState => {
    const nowPlaying = viewDataStore.getNowPlaying(deviceId)
    const queue = viewDataStore.getQueue(deviceId)
    const weather = viewDataStore.getWeather(deviceId)
    const agenda = viewDataStore.getAgenda(deviceId)
    const printers = viewDataStore.getPrinters(deviceId)
    const spools = viewDataStore.getSpools(deviceId)
    const printQueueChannel = devices.find(
      (device) => device.id === deviceId,
    )?.printQueueChannel
    const printQueue = printQueueChannel
      ? (platform?.hub.get(printQueueChannel)
          ?.data as ViewDataState["queue"])
      : undefined
    return {
      ...(nowPlaying ? { nowPlaying } : {}),
      ...(queue ? { queue } : {}),
      ...(printQueue ? { printQueue } : {}),
      ...(weather ? { weather } : {}),
      ...(agenda ? { agenda } : {}),
      ...(printers ? { printers } : {}),
      ...(spools ? { spools } : {}),
    }
  }

  /**
   * The spools channel is the one device-page feed that comes from the
   * platform's cache rather than from an MQTT push. Every device naming a
   * channel gets that channel's last valid value on connect and every change
   * after; a channel in `waiting` or `error` keeps the last value on the glass
   * rather than blanking it, the same way a retained MQTT payload would.
   */
  const spoolsDeviceIdsByChannelId = new Map<
    string,
    string[]
  >()
  devices.forEach((device) => {
    if (!device.spoolsChannel) {
      return
    }
    spoolsDeviceIdsByChannelId.set(device.spoolsChannel, [
      ...(spoolsDeviceIdsByChannelId.get(
        device.spoolsChannel,
      ) ?? []),
      device.id,
    ])
  })
  const applySpoolsSnapshot = (
    snapshot: ChannelSnapshot,
  ) => {
    devices
      .filter(
        (device) =>
          device.printQueueChannel === snapshot.id,
      )
      .forEach((device) => {
        if (
          snapshot.status === "ready" &&
          snapshot.type === "queue.v1"
        ) {
          hub.broadcast({
            deviceId: device.id,
            message: {
              type: "print_queue",
              data: snapshot.data as NonNullable<
                ViewDataState["queue"]
              >,
            },
          })
        }
      })
    const deviceIds = spoolsDeviceIdsByChannelId.get(
      snapshot.id,
    )
    if (
      !deviceIds ||
      snapshot.data === null ||
      snapshot.data === undefined ||
      (snapshot.status !== "ready" &&
        snapshot.status !== "stale")
    ) {
      return
    }
    const data = snapshot.data as ContractData["spools.v1"]
    deviceIds.forEach((deviceId) => {
      viewDataStore.setSpools({ deviceId, data })
      hub.broadcast({
        deviceId,
        message: { type: "spools", data },
      })
    })
  }
  const spoolsSubscription = {
    unsubscribe: undefined as (() => void) | undefined,
  }
  if (
    platform &&
    (spoolsDeviceIdsByChannelId.size > 0 ||
      devices.some((device) => device.printQueueChannel))
  ) {
    spoolsDeviceIdsByChannelId.forEach(
      (_ids, channelId) => {
        const snapshot = platform.hub.get(channelId)
        if (snapshot) {
          applySpoolsSnapshot(snapshot)
        }
      },
    )
    spoolsSubscription.unsubscribe = platform.hub.subscribe(
      applySpoolsSnapshot,
    )
  }

  /**
   * A spool command is EXECUTED here, by the device's spools channel source,
   * and never published: Home Assistant holds no spool inventory, so there is
   * nothing on the other end of the command topic that could act on it. The
   * source validates the spool, the slot and the tag against its own data
   * before it calls the dashboard.
   */
  const executeSpoolCommand = async ({
    deviceId,
    action,
    value,
    payload,
  }: {
    deviceId: string
    action: string
    value: string
    payload: Record<string, unknown>
  }) => {
    const device = stateStore.deviceById.get(deviceId)
    if (!platform || !device?.spoolsChannel) {
      throw new Error(
        `Device ${deviceId} has no spools channel to execute ${action}.`,
      )
    }
    await platform.runtime.executeAction({
      channelId: device.spoolsChannel,
      action: action.replace(/^spool_/, ""),
      payload: { ...payload, spoolId: value },
    })
  }

  /** The device's settings with the current global clock config stamped on. */
  const settingsWithClock = (
    deviceId: string,
  ): BrowserDeviceSettings => ({
    ...stateStore.getSettings(deviceId),
    clock: getGlobalClockConfig(),
  })

  const buildSnapshot = (
    deviceId: string,
  ): Extract<
    ServerToClientMessage,
    { type: "snapshot" }
  > | null => {
    const device = stateStore.deviceById.get(deviceId)
    if (!device) {
      return null
    }
    const browserViews = getBrowserViewsForDevice(device)
    const activeView = getBrowserViewByName({
      device,
      name: stateStore.getActiveView(deviceId),
    })
    return {
      type: "snapshot",
      device: {
        id: device.id,
        label: device.label,
        width: device.width,
        height: device.height,
        shape: device.shape,
        hasTouch: device.hasTouch,
        hasViewDrawer: device.hasViewDrawer,
        hasPrinterNavigation: Boolean(
          device.printQueueChannel,
        ),
        color: device.color,
        ...resolveBrowserPanelProperties(device),
        // Legacy aliases for a kiosk still on the pre-rename bundle. See
        // BrowserDeviceProfile. Drop once every panel has reloaded.
        colour: toLegacyColor(device.color),
        legacyShape:
          device.shape === "rectangle"
            ? "rect"
            : device.shape,
        externalViews: toClientExternalViews(device),
        views: browserViews.map(({ name, clientId }) => ({
          name,
          clientId,
        })),
      },
      settings: settingsWithClock(deviceId),
      view:
        activeView?.clientId ??
        browserViews[0]?.clientId ??
        "now-playing",
      data: buildViewDataState(deviceId),
      // What the panel compares against the bundle it is running. A reconnect
      // after a deploy carries a different id and the panel reloads itself.
      buildId: resolveSlatecastBuildId(),
    }
  }

  const applyView = async ({
    deviceId,
    payload,
    isRestore,
  }: {
    deviceId: string
    payload: string
    isRestore: boolean
  }) => {
    const device = stateStore.deviceById.get(deviceId)
    if (!device) {
      return
    }
    const view = getBrowserViewByName({
      device,
      name: payload,
    })
    if (
      !view ||
      !getBrowserViewsForDevice(device).some(
        (allowedView) => allowedView.name === view.name,
      )
    ) {
      return
    }
    if (
      isRestore &&
      stateStore.getHasExplicitView(deviceId)
    ) {
      return
    }
    stateStore.setActiveView({
      deviceId,
      viewName: view.name,
      isExplicit: !isRestore,
    })
    if (!isRestore) {
      const topics = topicsByDeviceId.get(deviceId)
      if (topics) {
        await publisher.publish({
          topic: topics.viewState,
          payload: view.name,
          isRetained: true,
        })
      }
    }
    hub.broadcast({
      deviceId,
      message: { type: "view", view: view.clientId },
    })
  }

  type RouteKind =
    | "ambientLight"
    | "view"
    | "viewRestore"
    | "reload"
    | "theme"
    | "themeRestore"
    | "rotation"
    | "rotationRestore"
    | "photoPeople"
    | "photoPeopleRestore"
    | "photoQuery"
    | "photoQueryRestore"
    | "photoInterval"
    | "photoIntervalRestore"
    | "backlightPower"
    | "backlightPowerState"
    | "backlightLevel"
    | "backlightLevelRestore"
    | "backlightBrightness"
    | "backlightAvailability"
    | "nowPlayingData"
    | "queueData"
    | "weatherData"
    | "agendaData"
    | "printersData"
    | "viewHold"

  const routes = new Map<
    string,
    { deviceId: string; kind: RouteKind }
  >()
  devices.forEach((device) => {
    const topics = topicsByDeviceId.get(device.id)
    if (!topics) {
      return
    }
    const routeEntries: readonly (readonly [
      string,
      RouteKind,
    ])[] = [
      [topics.viewCommand, "view"],
      [topics.viewState, "viewRestore"],
      [topics.reloadCommand, "reload"],
      [topics.themeCommand, "theme"],
      [topics.themeState, "themeRestore"],
      [topics.rotationCommand, "rotation"],
      [topics.rotationState, "rotationRestore"],
      [topics.photoPeopleCommand, "photoPeople"],
      [topics.photoPeopleState, "photoPeopleRestore"],
      [topics.photoQueryCommand, "photoQuery"],
      [topics.photoQueryState, "photoQueryRestore"],
      [topics.photoIntervalCommand, "photoInterval"],
      [topics.photoIntervalState, "photoIntervalRestore"],
      [topics.nowPlayingDataCommand, "nowPlayingData"],
      [topics.queueDataCommand, "queueData"],
      [topics.weatherDataCommand, "weatherData"],
      [topics.agendaDataCommand, "agendaData"],
      [topics.printersDataCommand, "printersData"],
      [topics.viewHoldCommand, "viewHold"],
    ]
    // Both native controllers and external agents use the same light command
    // topics. Only the external agent restores retained level/availability.
    const backlightRouteEntries: readonly (readonly [
      string,
      RouteKind,
    ])[] =
      device.hasMqttBacklight || device.hasRemoteBacklight
        ? [
            [topics.backlightCommand, "backlightPower"],
            ...(!device.hasRemoteBacklight
              ? [
                  [
                    topics.backlightState,
                    "backlightPowerState",
                  ] as const,
                ]
              : []),
            [
              topics.backlightLevelCommand,
              "backlightLevel",
            ],
            ...(!device.hasRemoteBacklight
              ? [
                  [
                    topics.backlightLevelState,
                    "backlightLevelRestore",
                  ] as const,
                ]
              : []),
            [
              topics.backlightBrightnessCommand,
              "backlightBrightness",
            ],
            ...(!device.hasRemoteBacklight
              ? [
                  [
                    topics.backlightAvailability,
                    "backlightAvailability",
                  ] as const,
                ]
              : []),
          ]
        : []
    routeEntries
      .concat(backlightRouteEntries)
      .concat(
        device.hasRemoteAmbientLight
          ? [[topics.ambientLightCommand, "ambientLight"]]
          : [],
      )
      .forEach(([topic, kind]) => {
        routes.set(topic, { deviceId: device.id, kind })
      })
  })

  const broadcastSettings = (deviceId: string) => {
    hub.broadcast({
      deviceId,
      message: {
        type: "settings",
        settings: settingsWithClock(deviceId),
      },
    })
  }

  // The global clock knobs live on the server-wide device (one set of topics,
  // not per browser device). When any changes, re-push settings to EVERY
  // browser device so their clocks reformat live — matching the ePaper re-push.
  const globalClockStateTopics = new Set([
    globalTopics.clockTimezoneState,
    globalTopics.clockTimeFormatState,
    globalTopics.clockDateStyleState,
  ])
  const broadcastSettingsToAll = () => {
    devices.forEach((device) => {
      broadcastSettings(device.id)
    })
  }

  /**
   * Push the stored level to the agent as the light's brightness command.
   * Not retained: the agent's availability transition is the restore path,
   * and a retained command would replay under Home Assistant's own sends.
   */
  const sendBacklightLevel = async (deviceId: string) => {
    const topics = topicsByDeviceId.get(deviceId)
    if (!topics) {
      return
    }
    await publisher.publish({
      topic: topics.backlightBrightnessCommand,
      payload: String(
        percentToBrightness(
          backlightStore.getPercent(deviceId),
        ),
      ),
      isRetained: false,
    })
  }

  const handleMessage = async ({
    topic,
    payload,
  }: {
    topic: string
    payload: string
  }) => {
    if (globalClockStateTopics.has(topic)) {
      broadcastSettingsToAll()
      return
    }
    const route = routes.get(topic)
    if (!route) {
      return
    }
    const { deviceId, kind } = route
    const topics = topicsByDeviceId.get(deviceId)
    if (!topics) {
      return
    }

    if (
      kind === "ambientLight" &&
      stateStore.deviceById.get(deviceId)
        ?.hasRemoteAmbientLight
    ) {
      if (ambientLightMqtt.command({ deviceId, payload }))
        mirrorAmbientLight(deviceId)
      return
    }
    if (
      stateStore.deviceById.get(deviceId)
        ?.hasRemoteBacklight &&
      [
        "backlightPower",
        "backlightBrightness",
        "backlightLevel",
      ].includes(kind)
    ) {
      if (
        remoteBacklightMqtt.command({
          deviceId,
          kind,
          payload,
        })
      ) {
        mirrorRemoteBacklight(deviceId)
      }
      return
    }
    if (
      kind === "backlightPower" ||
      kind === "backlightPowerState"
    ) {
      if (payload === "ON" || payload === "OFF") {
        backlightStore.setPower({
          deviceId,
          isOn: payload === "ON",
        })
      }
      return
    }
    if (kind === "view" || kind === "viewRestore") {
      await applyView({
        deviceId,
        payload,
        isRestore: kind === "viewRestore",
      })
      return
    }
    if (kind === "viewHold") {
      // Runtime, not a knob: no restore, no retained state topic, no entry in
      // `knobSetByDeviceId`. A server that restarts has nothing to hand back.
      const isViewHeld = payload === "on"
      if (!isViewHeld && payload !== "off") {
        return
      }
      stateStore.setSettings({
        deviceId,
        settings: { isViewHeld },
      })
      broadcastSettings(deviceId)
      return
    }
    if (kind === "reload") {
      hub.broadcast({
        deviceId,
        message: { type: "reload" },
      })
      return
    }
    if (kind === "theme" || kind === "themeRestore") {
      const theme = parseThemePayload(payload)
      if (theme === null) {
        return
      }
      if (
        kind === "themeRestore" &&
        knobSetByDeviceId.theme.has(deviceId)
      ) {
        return
      }
      knobSetByDeviceId.theme.add(deviceId)
      stateStore.setSettings({
        deviceId,
        settings: { theme },
      })
      if (kind === "theme") {
        await publisher.publish({
          topic: topics.themeState,
          payload: theme,
          isRetained: true,
        })
      }
      broadcastSettings(deviceId)
      return
    }
    if (kind === "rotation" || kind === "rotationRestore") {
      const rotation = parseRotationPayload(payload)
      if (rotation === null) {
        return
      }
      if (
        kind === "rotationRestore" &&
        knobSetByDeviceId.rotation.has(deviceId)
      ) {
        return
      }
      knobSetByDeviceId.rotation.add(deviceId)
      stateStore.setSettings({
        deviceId,
        settings: { orientation: rotation },
      })
      if (kind === "rotation") {
        await publisher.publish({
          topic: topics.rotationState,
          payload: String(rotation),
          isRetained: true,
        })
      }
      broadcastSettings(deviceId)
      return
    }
    if (
      kind === "photoPeople" ||
      kind === "photoPeopleRestore"
    ) {
      if (
        kind === "photoPeopleRestore" &&
        knobSetByDeviceId.photoPeople.has(deviceId)
      ) {
        return
      }
      knobSetByDeviceId.photoPeople.add(deviceId)
      photoConfigStore.setPhotoPeople({
        deviceId,
        peopleText: payload,
      })
      if (kind === "photoPeople") {
        await publisher.publish({
          topic: topics.photoPeopleState,
          payload,
          isRetained: true,
        })
      }
      return
    }
    if (
      kind === "photoQuery" ||
      kind === "photoQueryRestore"
    ) {
      if (
        kind === "photoQueryRestore" &&
        knobSetByDeviceId.photoQuery.has(deviceId)
      ) {
        return
      }
      knobSetByDeviceId.photoQuery.add(deviceId)
      photoConfigStore.setPhotoQuery({
        deviceId,
        queryText: payload,
      })
      if (kind === "photoQuery") {
        await publisher.publish({
          topic: topics.photoQueryState,
          payload,
          isRetained: true,
        })
      }
      return
    }
    if (
      kind === "photoInterval" ||
      kind === "photoIntervalRestore"
    ) {
      const intervalMinutes =
        parsePhotoIntervalPayload(payload)
      if (intervalMinutes === null) {
        return
      }
      if (
        kind === "photoIntervalRestore" &&
        knobSetByDeviceId.photoInterval.has(deviceId)
      ) {
        return
      }
      knobSetByDeviceId.photoInterval.add(deviceId)
      stateStore.setSettings({
        deviceId,
        settings: { photoIntervalMinutes: intervalMinutes },
      })
      if (kind === "photoInterval") {
        await publisher.publish({
          topic: topics.photoIntervalState,
          payload: String(intervalMinutes),
          isRetained: true,
        })
      }
      broadcastSettings(deviceId)
      return
    }
    if (
      kind === "backlightLevel" ||
      kind === "backlightLevelRestore"
    ) {
      const percent = parseBacklightPercentPayload(payload)
      if (percent === null) {
        return
      }
      if (
        kind === "backlightLevelRestore" &&
        knobSetByDeviceId.backlight.has(deviceId)
      ) {
        return
      }
      knobSetByDeviceId.backlight.add(deviceId)
      backlightStore.setPercent({ deviceId, percent })
      if (kind === "backlightLevel") {
        await publisher.publish({
          topic: topics.backlightLevelState,
          payload: String(percent),
          isRetained: true,
        })
      }
      // A fresh command dims the panel at once. A boot-time restore sends it
      // too when the agent is already online — the retained level and the
      // retained availability arrive in either order, and whichever lands
      // second must be the one that reaches the panel.
      if (
        kind === "backlightLevel" ||
        backlightOnlineDeviceIds.has(deviceId)
      ) {
        await sendBacklightLevel(deviceId)
      }
      return
    }
    if (kind === "backlightBrightness") {
      // Home Assistant's light entity (0–255) is the second source of truth.
      // Store + retained state ONLY: the agent already consumed this command,
      // and echoing it back to `backlight/brightness/set` would loop.
      const brightness =
        parseBacklightBrightnessPayload(payload)
      if (brightness === null) {
        return
      }
      const percent = brightnessToPercent(brightness)
      knobSetByDeviceId.backlight.add(deviceId)
      backlightStore.setPercent({ deviceId, percent })
      await publisher.publish({
        topic: topics.backlightLevelState,
        payload: String(percent),
        isRetained: true,
      })
      return
    }
    if (kind === "backlightAvailability") {
      const isOnline = payload === "online"
      const isPreviouslyOnline =
        backlightOnlineDeviceIds.has(deviceId)
      if (isOnline) {
        backlightOnlineDeviceIds.add(deviceId)
      } else {
        backlightOnlineDeviceIds.delete(deviceId)
      }
      if (isOnline && !isPreviouslyOnline) {
        await sendBacklightLevel(deviceId)
      }
      return
    }
    if (kind === "nowPlayingData") {
      const data = parseNowPlayingPayload(
        parseJsonPayload(payload),
      )
      viewDataStore.setNowPlaying({ deviceId, data })
      hub.broadcast({
        deviceId,
        message: { type: "now_playing", data },
      })
      return
    }
    if (kind === "queueData") {
      const data = parseQueuePayload(
        parseJsonPayload(payload),
      )
      viewDataStore.setQueue({ deviceId, data })
      hub.broadcast({
        deviceId,
        message: { type: "queue", data },
      })
      return
    }
    if (kind === "weatherData") {
      const data = parseWeatherPayload(
        parseJsonPayload(payload),
      )
      if (!data) {
        return
      }
      viewDataStore.setWeather({ deviceId, data })
      hub.broadcast({
        deviceId,
        message: { type: "weather", data },
      })
      return
    }
    if (kind === "agendaData") {
      const data = parseAgendaPayload(
        parseJsonPayload(payload),
      )
      viewDataStore.setAgenda({ deviceId, data })
      hub.broadcast({
        deviceId,
        message: { type: "agenda", data },
      })
      return
    }
    if (kind === "printersData") {
      const data = parsePrintersPayload(
        parseJsonPayload(payload),
      )
      viewDataStore.setPrinters({ deviceId, data })
      hub.broadcast({
        deviceId,
        message: { type: "printers", data },
      })
    }
  }

  const start = async () => {
    // Before the broker check: a framed application's health matters on an
    // install with no broker at all. Not awaited, so a slow application never
    // holds up discovery.
    void externalViewHealth.start()
    if (!publisher.isEnabled || devices.length === 0) {
      return
    }
    const discoveryConfig = {
      discoveryPrefix: config.mqtt.discoveryPrefix,
      nodeId: config.mqtt.nodeId,
      baseTopic,
    }
    await Promise.all(
      devices
        .flatMap((device) =>
          buildBrowserDiscoveryMessages({
            device,
            config: discoveryConfig,
          }),
        )
        .map((message) =>
          publisher.publish({
            topic: message.topic,
            payload: JSON.stringify(message.payload),
            isRetained: message.isRetained,
          }),
        ),
    )

    await publisher.subscribe({
      topics: [...routes.keys(), ...globalClockStateTopics],
      handler: handleMessage,
    })

    await Promise.all(
      devices
        .filter((device) => device.hasRemoteBacklight)
        .map((device) =>
          remoteBacklightMqtt.publish({
            deviceId: device.id,
            isForced: true,
          }),
        ),
    )

    await Promise.all(
      devices
        .filter((device) => device.hasRemoteAmbientLight)
        .map((device) =>
          ambientLightMqtt.publish({
            deviceId: device.id,
            isForced: true,
          }),
        ),
    )

    // Publish the URL diagnostic sensor + reset the connected flag (retained
    // ON from a previous run would lie until the first socket event).
    await Promise.all(
      devices.flatMap((device) => {
        const topics = topicsByDeviceId.get(device.id)
        if (!topics) {
          return []
        }
        return [
          publisher.publish({
            topic: topics.url,
            payload: `${config.publicUrl}/d/${device.id}`,
            isRetained: true,
          }),
          publisher.publish({
            topic: topics.connected,
            payload:
              hub.getConnectionCount(device.id) > 0
                ? "ON"
                : "OFF",
            isRetained: true,
          }),
        ]
      }),
    )

    // Seed retained state for knobs/views with no retained value yet (any
    // retained restore lands within the first seconds of the subscription).
    setTimeout(() => {
      devices.forEach((device) => {
        const topics = topicsByDeviceId.get(device.id)
        if (!topics) {
          return
        }
        const seedPairs = [
          {
            topic: topics.viewState,
            hasValue: stateStore.getHasExplicitView(
              device.id,
            ),
            payload: stateStore.getActiveView(device.id),
          },
          {
            topic: topics.themeState,
            hasValue: knobSetByDeviceId.theme.has(
              device.id,
            ),
            payload: stateStore.getSettings(device.id)
              .theme,
          },
          {
            topic: topics.rotationState,
            hasValue: knobSetByDeviceId.rotation.has(
              device.id,
            ),
            payload: String(
              stateStore.getSettings(device.id).orientation,
            ),
          },
          ...(device.hasMqttBacklight &&
          !device.hasRemoteBacklight
            ? [
                {
                  topic: topics.backlightLevelState,
                  hasValue: knobSetByDeviceId.backlight.has(
                    device.id,
                  ),
                  payload: String(
                    backlightStore.getPercent(device.id),
                  ),
                },
              ]
            : []),
        ]
        seedPairs
          .filter((seedPair) => !seedPair.hasValue)
          .forEach((seedPair) => {
            publisher
              .publish({
                topic: seedPair.topic,
                payload: seedPair.payload,
                isRetained: true,
              })
              .catch(() => {})
          })
      })
    }, 5_000)
  }

  /** Attach `/d/:id`, its WebSocket, and the SPA assets to the HTTP app. */
  const attach = (
    app: Hono,
    options?: {
      getPlatformTarget?: (
        deviceId: string,
      ) =>
        | { kind: "view" | "screen"; id: string }
        | undefined
    },
  ) => {
    const { injectWebSocket, upgradeWebSocket } =
      createNodeWebSocket({ app })

    const distDir = resolveSlatecastDistDir()
    if (distDir) {
      // `immutablePathPrefixes: []` is load-bearing, not tidying.
      // The default treats `/assets/*` as content-hashed and caches it
      // for a year — correct for a normal Vite build, WRONG here:
      // slatecast pins fixed names (`assets/slatecast.js`, see its
      // vite.config.ts) because the page shell references them
      // directly with no manifest indirection. The bytes behind that
      // URL change on every deploy, and the HA Reload button is the
      // cache-buster. `immutable` would out-rank the reload and strand
      // every panel on stale JS until the cache expired.
      //
      // With the list empty, everything falls in the revalidating
      // bucket: `no-cache` + ETag, so a reload costs one 304 rather
      // than the whole bundle. That is strictly better than today,
      // which sends no cache headers at all and leaves it to the
      // browser's heuristics.
      //
      // An asset origin, nothing else: the `/d/:id` pages below are
      // rendered by this server, so `hasSpaFallback: false` keeps a
      // missing chunk a 404 instead of answering it with HTML.
      //
      // `rootDir` is absolute here. The previous `relative(cwd, …)`
      // dance existed because `serveStatic` resolves a *relative* root
      // against the cwd — an absolute one needs no such care, and the
      // cwd stops mattering.
      app.use(
        "/assets/*",
        createStaticHandler({
          hasSpaFallback: false,
          immutablePathPrefixes: [],
          rootDir: distDir,
        }),
      )
    } else {
      console.warn(
        "[castkit] no Slatecast SPA build found — /d pages will 500 on assets (set SLATECAST_DIST_DIR or build packages/slatecast)",
      )
    }

    app.get("/d/:id", (context) => {
      const snapshot = buildSnapshot(
        context.req.param("id") ?? "",
      )
      if (!snapshot) {
        return context.json(
          { error: "unknown device" },
          404,
        )
      }
      const target = options?.getPlatformTarget?.(
        context.req.param("id") ?? "",
      )
      if (target)
        return context.html(
          buildPlatformPage().replace(
            "</body>",
            `<script id="castkit-platform-target" type="application/json">${JSON.stringify({ ...target, deviceId: context.req.param("id") }).replaceAll("<", "\\u003c")}</script></body>`,
          ),
        )
      return context.html(buildDevicePageHtml({ snapshot }))
    })

    app.get("/d/:id/castkit.json", (context) => {
      const deviceId = context.req.param("id") ?? ""
      const device = stateStore.deviceById.get(deviceId)
      if (!device) {
        return context.json(
          { error: "unknown device" },
          404,
        )
      }
      return context.json({
        version: 1,
        viewport: {
          width: device.width,
          height: device.height,
        },
        page_url: `/d/${device.id}`,
        ...(device.hasRemoteBacklight ||
        device.hasRemoteAmbientLight
          ? {
              controls_url: `/d/${device.id}/controls.json`,
            }
          : {}),
        ready_selector: "[data-castkit-ready]",
        input: {
          target_attribute: "data-castkit-target",
          max_frame_age_ms: 7000,
        },
        cache: [],
        refresh: { max_fps: 10, heartbeat_ms: 2000 },
      })
    })

    app.get("/d/:id/controls.json", (context) => {
      const deviceId = context.req.param("id") ?? ""
      const device = stateStore.deviceById.get(deviceId)
      if (
        !device?.hasRemoteBacklight &&
        !device?.hasRemoteAmbientLight
      ) {
        return context.json(
          { error: "no direct backlight" },
          404,
        )
      }
      context.header("Cache-Control", "no-store")
      return context.json({
        ...(device?.hasRemoteBacklight
          ? remoteBacklight.resolve(deviceId)
          : {}),
        ...(device?.hasRemoteAmbientLight
          ? {
              ambientLight:
                remoteAmbientLight.get(deviceId),
              ambientLightData:
                readAmbientLightData(deviceId),
            }
          : {}),
      })
    })

    // A fresh, face-cropped Immich photo sized to this browser panel. The SPA
    // Photo Frame view points an <img> here and re-requests on its rotation
    // interval; each call returns a new recency-weighted random photo. A 204
    // (Immich off, or no People/Query set) tells the SPA to show a placeholder.
    app.get("/d/:id/photo", async (context) => {
      const deviceId = context.req.param("id") ?? ""
      const device = stateStore.deviceById.get(deviceId)
      if (!device) {
        return context.body(null, 404)
      }
      if (!isPhotoFrameEnabled) {
        return context.body(null, 204)
      }
      const peopleText =
        photoConfigStore.getPhotoPeople(deviceId)
      const queryText = photoConfigStore
        .getPhotoQuery(deviceId)
        .trim()
      if (!peopleText && !queryText) {
        return context.body(null, 204)
      }

      try {
        const { personIds } = peopleText
          ? await resolvePersonIds({
              config: immichConfig,
              peopleText,
            })
          : { personIds: [] as string[] }
        if (personIds.length === 0 && !queryText) {
          return context.body(null, 204)
        }

        const assetId = await pickRandomAssetId({
          config: immichConfig,
          personIds,
          query: queryText || undefined,
          recencyHalfLifeDays: PHOTO_RECENCY_HALF_LIFE_DAYS,
        })
        if (!assetId) {
          return context.body(null, 204)
        }

        const [jpegBytes, faceBoxes] = await Promise.all([
          fetchPreviewJpeg({
            config: immichConfig,
            assetId,
          }),
          fetchFaceBoxes({
            config: immichConfig,
            assetId,
            personIds,
          }),
        ])
        const { png } = await preparePhotoFrameImage({
          jpegBytes,
          targetWidth: device.width,
          targetHeight: device.height,
          faceBoxes,
          // Browser Photo Frame keeps the letterbox fit; the Fill/Duo views are
          // image-mode (ePaper) only for now.
          fitMode: "letterbox",
        })
        return context.body(new Uint8Array(png), 200, {
          "Content-Type": "image/png",
          "Cache-Control": "no-store",
        })
      } catch (error) {
        console.error(
          `[castkit] browser photo ${deviceId}: fetch failed`,
          error,
        )
        return context.body(null, 502)
      }
    })

    app.get(
      "/d/:id/ws",
      upgradeWebSocket((context) => {
        const deviceId = context.req.param("id") ?? ""
        const isObserver =
          context.req.query("preview") === "1"
        return {
          onOpen: (_event, ws) => {
            const socket = ws as unknown as HubSocket
            const snapshot = buildSnapshot(deviceId)
            if (!snapshot) {
              ws.close(4004, "unknown device")
              return
            }
            hub.addSocket({ deviceId, socket, isObserver })
            hub.sendTo({ socket, message: snapshot })
          },
          onMessage: (event) => {
            // Management viewers receive updates but never issue commands.
            if (isObserver) {
              return
            }
            const parsed = parseJsonPayload(
              String(event.data),
            ) as
              | { type?: string; command?: unknown }
              | undefined
            if (parsed?.type !== "command") {
              return
            }
            const command = parseDeviceCommand(
              parsed.command,
            )
            const topics = topicsByDeviceId.get(deviceId)
            if (!command || !topics) {
              return
            }
            /*
             * A view request from the panel is already inside CastKit's
             * authenticated device socket. Apply it here so the screen can
             * navigate even when Home Assistant has no per-panel automation.
             * The command still publishes below: HA remains informed and can
             * apply its longer-lived display policy after the direct choice.
             */
            if (
              command.action === "view" &&
              typeof command.value === "string"
            ) {
              const device =
                stateStore.deviceById.get(deviceId)
              const requestedView = device
                ? getBrowserViewsForDevice(device).find(
                    (view) =>
                      view.clientId === command.value,
                  )
                : undefined
              if (requestedView) {
                applyView({
                  deviceId,
                  payload: requestedView.name,
                  isRestore: false,
                }).catch((error) => {
                  console.error(
                    `[castkit] direct view request failed for ${deviceId}`,
                    error,
                  )
                })
              }
            }
            if (
              SPOOL_COMMAND_ACTIONS.includes(
                command.action,
              ) &&
              typeof command.value === "string"
            ) {
              executeSpoolCommand({
                deviceId,
                action: command.action,
                value: command.value,
                payload: command.payload ?? {},
              }).catch((error) => {
                console.error(
                  `[castkit] ${command.action} failed for ${deviceId}`,
                  error,
                )
              })
              return
            }
            publisher
              .publish({
                topic: topics.command,
                payload: JSON.stringify({
                  ...command,
                  ts: new Date().toISOString(),
                }),
              })
              .catch((error) => {
                console.error(
                  `[castkit] command publish failed for ${deviceId}`,
                  error,
                )
              })
          },
          onClose: (_event, ws) => {
            hub.removeSocket({
              deviceId,
              socket: ws as unknown as HubSocket,
            })
          },
        }
      }),
    )

    return { injectWebSocket, upgradeWebSocket }
  }

  /**
   * The management UI's read of a browser device's knobs (the same shape the
   * image devices return). Null for an unknown device.
   */
  const getDeviceSettings = (
    deviceId: string,
  ): Record<string, string> | null => {
    const device = stateStore.deviceById.get(deviceId)
    if (!device) {
      return null
    }
    const ambientSettings = device.hasRemoteAmbientLight
      ? (() => {
          const state = remoteAmbientLight.get(deviceId)
          return {
            ambientLightPower: state.isOn ? "on" : "off",
            ambientLightBrightness: String(
              state.brightness,
            ),
            ambientLightMode: state.mode,
            ambientLightDemo: String(state.demo),
          }
        })()
      : {}
    if (device.hasRemoteBacklight) {
      const settings = remoteBacklight.get(deviceId)
      return {
        ...ambientSettings,
        backlightLevel: String(settings.level),
        backlightPower: settings.power,
        backlightRoomChannel: settings.channel,
        backlightRoomEntity: settings.entity,
        backlightEffective: String(
          remoteBacklight.resolve(deviceId)
            .backlight_percent,
        ),
        backlightRoomStatus: String(
          remoteBacklight.resolve(deviceId).room_status,
        ),
      }
    }
    return device.hasMqttBacklight
      ? {
          ...ambientSettings,
          backlightLevel: String(
            backlightStore.getPercent(deviceId),
          ),
          backlightPower: backlightStore.getIsOn(deviceId)
            ? "on"
            : "off",
          backlightEffective: String(
            backlightStore.getIsOn(deviceId)
              ? backlightStore.getPercent(deviceId)
              : 0,
          ),
        }
      : ambientSettings
  }

  /**
   * The management UI's write: publish the knob's command topic, so the
   * change takes the same MQTT path Home Assistant's entity would.
   */
  const setDeviceSetting = async ({
    deviceId,
    kind,
    payload,
  }: {
    deviceId: string
    kind: string
    payload: string
  }) => {
    const device = stateStore.deviceById.get(deviceId)
    const topics = topicsByDeviceId.get(deviceId)
    if (
      device?.hasRemoteAmbientLight &&
      kind.startsWith("ambientLight")
    ) {
      const isUpdated = remoteAmbientLight.set({
        deviceId,
        kind,
        payload,
      })
      if (isUpdated) mirrorAmbientLight(deviceId)
      return isUpdated
    }
    if (device?.hasRemoteBacklight) {
      const isUpdated = remoteBacklight.set({
        deviceId,
        kind,
        payload,
      })
      if (isUpdated) mirrorRemoteBacklight(deviceId)
      return isUpdated
    }
    if (
      !device ||
      !topics ||
      !publisher.isEnabled ||
      !["backlightLevel", "backlightPower"].includes(
        kind,
      ) ||
      !device.hasMqttBacklight
    ) {
      return false
    }
    if (
      kind === "backlightPower" &&
      !["on", "off"].includes(payload)
    )
      return false
    if (
      kind === "backlightLevel" &&
      parseBacklightPercentPayload(payload) === null
    )
      return false
    await publisher.publish({
      topic:
        kind === "backlightPower"
          ? topics.backlightCommand
          : topics.backlightLevelCommand,
      payload:
        kind === "backlightPower"
          ? payload.toUpperCase()
          : payload,
      isRetained: false,
    })
    return true
  }

  return {
    reloadDevice: (deviceId: string) =>
      hub.broadcast({
        deviceId,
        message: { type: "reload" },
      }),
    deviceCount: devices.length,
    start,
    /** Stops the timers this mode owns, so a test (or shutdown) can settle. */
    stop: () => {
      spoolsSubscription.unsubscribe?.()
      backlightSubscription?.()
      externalViewHealth.stop()
      hub.stop()
    },
    attach,
    getDeviceSettings,
    setDeviceSetting,
  }
}
