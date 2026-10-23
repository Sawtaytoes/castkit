import { createHash } from "node:crypto"
import { MONOCHROME_PALETTE } from "@castkit/core/panels/palette"
import type { FullColorEncoding } from "@castkit/core/pipeline/dither"
import {
  getIsLossyEncodableView,
  type ViewName,
} from "@castkit/shared/views/viewNames"
import type { ConfiguredDevice } from "./config/env.ts"
import { buildDeviceTopics } from "./homeAssistant/discovery.ts"
import type { MqttPublisher } from "./mqtt/publisher.ts"
import { createFrameStore } from "./render/frameStore.ts"
import type { RenderService } from "./render/renderService.ts"
import type { DeviceConfigStore } from "./state/deviceConfigStore.ts"
import type { DeviceStore } from "./state/deviceStore.ts"
import type { RenderTokenStore } from "./state/renderTokenStore.ts"
import type { ViewDataStore } from "./state/viewDataStore.ts"
import type { ClockConfig } from "./views/registry.ts"

/*
 * Who a display is never changes a pixel, so these never enter a frame key:
 * two installations of one panel model at the same settings share frames.
 */
const IDENTITY_FIELDS = new Set([
  "id",
  "label",
  "mac",
  "photoPeople",
  "renderOn",
])

const hashFrameKey = (value: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")

/** Effective image-rendering settings shared by delivery and read-only previews. */
export type DeviceRenderSettings = {
  device: ConfiguredDevice
  margin?: import("@castkit/core/panels/safeArea").PanelMargin
  adjustments?: import("@castkit/core/pipeline/dither").DitherAdjustments
}

/**
 * The single place that renders a device's current view and pushes it to MQTT
 * (image + view-state + last-render timestamp). Shared by the HTTP API, the
 * MQTT command handler, and the data adapters so every path behaves
 * identically. When MQTT is disabled the publish calls no-op, so
 * `renderDevice` (the HTTP GET) still works.
 *
 * The rendered view is always the SELECTED view — no server-side idle
 * fallback. Home Assistant automations drive the View select (the "Music
 * playing" binary sensor is the signal they key off).
 */
export type PushController = {
  deviceById: Map<string, ConfiguredDevice>
  renderDevice: (deviceId: string) => Promise<Buffer | null>
  getRenderSettings: (
    deviceId: string,
  ) => DeviceRenderSettings | null
  renderPreview: (request: {
    deviceId: string
    kind: "view" | "screen"
    id: string
  }) => Promise<Buffer | null>
  pushDevice: (
    deviceId: string,
    options?: { isForced?: boolean; isRequested?: boolean },
  ) => Promise<boolean>
  setView: (params: {
    deviceId: string
    viewName: ViewName
  }) => Promise<boolean>
  /**
   * The key a frame rendered ahead for a `renderOn: "request"` display would
   * carry now, or `undefined` when the held frame is current or none can be
   * kept (another delivery mode, paused, no platform target, or a
   * time-driven view). The platform image scheduler polls this.
   */
  getPrerenderKey: (deviceId: string) => string | undefined
  /** Render a request display's frame into memory so its next request is instant. */
  prerenderDevice: (deviceId: string) => Promise<boolean>
}

export const createPushController = ({
  devices,
  deviceStore,
  deviceConfigStore,
  viewDataStore,
  renderService,
  publisher,
  baseTopic,
  resolvePhotoEncoding,
  resolveClockConfig,
  renderTokenStore,
  publicUrl,
  renderPlatform,
  getPlatformSelection,
  getPlatformFrameKey,
}: {
  /**
   * What a display's platform frame is drawn from (`readPlatformFrameKey`),
   * naming no device, or `undefined` when it cannot be kept.
   */
  getPlatformFrameKey?: (
    deviceId: string,
  ) => string | undefined
  getPlatformSelection?: (
    deviceId: string,
  ) => string | undefined
  renderPlatform?: (
    request: DeviceRenderSettings & {
      target?: { kind: "view" | "screen"; id: string }
    },
  ) => Promise<Buffer | null>
  devices: readonly ConfiguredDevice[]
  deviceStore: DeviceStore
  deviceConfigStore: DeviceConfigStore
  viewDataStore: ViewDataStore
  renderService: RenderService
  publisher: MqttPublisher
  baseTopic: string
  /**
   * Mints the single-use render tokens whose URLs are published to "http-pull"
   * panels (the same store the public `/render/<token>.png` endpoint serves).
   */
  renderTokenStore: RenderTokenStore
  /** Public base URL a "http-pull" panel fetches, e.g. https://castkit.octen.dev. */
  publicUrl: string
  /**
   * The device's resolved full-color wire format (per-device override or
   * global default, both HA config). Only the bleed photo view uses it; every
   * other view stays lossless PNG so text and exact palette colors are never
   * degraded.
   */
  resolvePhotoEncoding: (
    deviceId: string,
  ) => FullColorEncoding
  /** The device's resolved clock timezone + time/date format (HA config). */
  resolveClockConfig: (deviceId: string) => ClockConfig
}): PushController => {
  const deviceById = new Map(
    devices.map((device) => [device.id, device]),
  )

  // Per-device hash of the last render whose URL we published to a "http-pull"
  // panel. A full ePaper refresh is expensive (and flashy), so we only publish a
  // fresh URL when the rendered bytes actually changed — a clock ticks every
  // minute so it still updates, but an unchanged agenda/now-playing frame won't
  // needlessly reflash the panel.
  const lastPublishedHashByDevice = new Map<
    string,
    string
  >()

  // Rendered frames in memory, addressed by what changes their pixels. Two
  // displays whose keys match share one render and one Buffer; a watch's
  // request is answered from it instead of a Chromium capture.
  const frames = createFrameStore()

  const getRenderSettings = (
    deviceId: string,
  ): DeviceRenderSettings | null => {
    const device = deviceById.get(deviceId)
    if (!device) {
      return null
    }

    // HA-edited display config overrides the registry defaults.
    const ditherOverride =
      deviceConfigStore.getDitherAlgorithm(deviceId)
    const rotationOverride =
      deviceConfigStore.getRotationOverride(deviceId)
    const isBlackAndWhite =
      deviceConfigStore.getColorModeOverride(deviceId) ===
      "bw"
    const brightnessPercent =
      deviceConfigStore.getBrightnessPercent(deviceId)
    const saturationPercent =
      deviceConfigStore.getSaturationPercent(deviceId)

    const effectiveDevice = {
      ...device,
      ...(isBlackAndWhite
        ? {
            colorMode: "monochrome" as const,
            palette: MONOCHROME_PALETTE,
          }
        : {}),
      ...(rotationOverride !== undefined
        ? { rotation: rotationOverride }
        : {}),
      ditherProfile: {
        ...device.ditherProfile,
        ...(ditherOverride
          ? { algorithm: ditherOverride }
          : {}),
      },
    }

    const hasAdjustments =
      (brightnessPercent !== undefined &&
        brightnessPercent !== 100) ||
      (saturationPercent !== undefined &&
        saturationPercent !== 100)

    return {
      device: effectiveDevice,
      margin: deviceConfigStore.getMargin(deviceId),
      adjustments: hasAdjustments
        ? {
            brightness: (brightnessPercent ?? 100) / 100,
            saturation: (saturationPercent ?? 100) / 100,
          }
        : undefined,
    }
  }

  /**
   * Everything a Satori view of this display is drawn from, read once so the
   * frame's key and its render see the same values. The data is per display
   * (Home Assistant pushes each one its own payloads), and it enters the key
   * BY VALUE: two displays share a frame only when their data is equal.
   */
  const readViewInputs = ({
    deviceId,
    viewName,
    settings,
  }: {
    deviceId: string
    viewName: ViewName
    settings: DeviceRenderSettings
  }) => {
    // A "http-pull" panel is an ESPHome `online_image`, whose decoder is chosen
    // at COMPILE time (`format: png`) — it sniffs the magic bytes and rejects
    // anything else with "Incorrect PNG signature". So the photo-format knobs
    // must not apply to it: leaving it on "Auto" made it inherit the global
    // JPEG default (which exists for the ARMv6 photo Pi) and the panel went
    // blank until someone noticed. Force PNG here rather than relying on a
    // retained per-device override a future session could set back to "Auto".
    const isFormatLockedToPng =
      settings.device.imageDelivery === "http-pull"
    // Only a photo view may ship a lossy full-color frame; every other view
    // stays lossless PNG (exact text + palette colors).
    const fullColorEncoding: FullColorEncoding =
      getIsLossyEncodableView(viewName) &&
      !isFormatLockedToPng
        ? resolvePhotoEncoding(deviceId)
        : { format: "png" }
    return {
      viewName,
      clock: resolveClockConfig(deviceId),
      // HA pushes each display its own now-playing / weather / agenda payload,
      // all keyed by device id.
      nowPlaying: viewDataStore.getNowPlaying(deviceId),
      photoFrame: viewDataStore.getPhotoFrame(deviceId),
      weather: viewDataStore.getWeather(deviceId),
      agenda: viewDataStore.getAgenda(deviceId),
      fullColorEncoding,
    }
  }

  const renderFrame = async ({
    settings,
    inputs,
    now,
  }: {
    settings: DeviceRenderSettings
    inputs: ReturnType<typeof readViewInputs>
    now: Date
  }) => {
    const { device, margin, adjustments } = settings
    const platformImage = await renderPlatform?.({
      device,
      margin,
      adjustments,
    })
    if (platformImage) return platformImage
    // EVERY view honors the mat's safe-area crop, photos included.
    return renderService.renderDevice({
      device,
      ...inputs,
      adjustments,
      ...(margin ? { margin } : {}),
      now,
    })
  }

  /**
   * `viewName` pins which view to render. `pushDevice` passes the view it read
   * before starting, so the rendered bytes, the logged name and the published
   * `view` state all describe the same frame even if the owner switches views
   * mid-render. Callers that just want "whatever is current" omit it.
   *
   * The plan carries the frame's KEY — everything that changes its pixels,
   * and never who the display is — or no key when the frame cannot be kept
   * (a platform view that is time-driven). `isPlatform` marks a key that time
   * alone never changes, the only kind worth rendering ahead.
   */
  const planFrame = ({
    deviceId,
    viewName,
  }: {
    deviceId: string
    viewName?: ViewName
  }) => {
    const settings = getRenderSettings(deviceId)
    if (!settings) return undefined
    const now = new Date()
    const inputs = readViewInputs({
      deviceId,
      viewName:
        viewName ?? deviceStore.getActiveView(deviceId),
      settings,
    })
    const render = () =>
      renderFrame({ settings, inputs, now })
    const pixelSettings = {
      device: Object.fromEntries(
        Object.entries(settings.device).filter(
          ([name]) => !IDENTITY_FIELDS.has(name),
        ),
      ),
      margin: settings.margin,
      adjustments: settings.adjustments,
    }
    const platformKey = getPlatformFrameKey?.(deviceId)
    if (platformKey !== undefined) {
      return {
        key: hashFrameKey({ platformKey, pixelSettings }),
        isPlatform: true,
        render,
      }
    }
    // On the platform, but time-driven: render every time, keep nothing.
    if (getPlatformSelection?.(deviceId) !== undefined) {
      return { key: undefined, isPlatform: false, render }
    }
    // A Satori view reads the clock to the minute, and an agenda drops an
    // event the moment it starts (`buildAgendaEvents`).
    return {
      key: hashFrameKey({
        pixelSettings,
        inputs,
        minute: Math.floor(now.getTime() / 60_000),
        upcomingAgendaEventCount:
          inputs.agenda?.events.filter(
            (event) =>
              event.isAllDay ||
              event.startMs >= now.getTime(),
          ).length,
      }),
      isPlatform: false,
      render,
    }
  }

  const renderDevice = async (deviceId: string) =>
    (await planFrame({ deviceId })?.render()) ?? null

  const getPrerenderKey = (deviceId: string) => {
    if (deviceById.get(deviceId)?.renderOn !== "request") {
      return undefined
    }
    const plan = planFrame({ deviceId })
    if (!plan?.key || !plan.isPlatform) {
      // No frame can be kept, so the one held is stale for good.
      frames.forget(deviceId)
      return undefined
    }
    if (!deviceConfigStore.getIsUpdatesEnabled(deviceId)) {
      return undefined
    }
    // Pointing the display at its key now lets a frame another display
    // already holds serve it, with no render at all.
    return frames.link({ deviceId, key: plan.key })
      ? undefined
      : plan.key
  }

  const prerenderDevice = async (deviceId: string) => {
    const plan =
      deviceById.get(deviceId)?.renderOn === "request"
        ? planFrame({ deviceId })
        : undefined
    if (
      !plan?.key ||
      !plan.isPlatform ||
      !deviceConfigStore.getIsUpdatesEnabled(deviceId)
    ) {
      return false
    }
    const isAlreadyHeld = frames.getHasFrame(plan.key)
    const startedAt = performance.now()
    const isReady = await frames.prepare({
      deviceId,
      key: plan.key,
      renderFrame: plan.render,
    })
    if (!isAlreadyHeld) {
      console.log(
        `[inkcast] frame ahead ${deviceId} (${Math.round(performance.now() - startedAt)} ms)`,
      )
    }
    return isReady
  }

  const pushDevice = async (
    deviceId: string,
    {
      isForced = false,
      isRequested = false,
    }: { isForced?: boolean; isRequested?: boolean } = {},
  ) => {
    // A `renderOn: "request"` display deep-sleeps between wakes and asks for
    // its frame on `refresh/set`. A frame rendered for the clock tick, a data
    // push or a setting change reaches nobody, and the render alone kept the
    // capture browser open all day. Bail silently: these calls arrive every
    // minute, and the next request renders the current state anyway.
    if (
      !isRequested &&
      deviceById.get(deviceId)?.renderOn === "request"
    ) {
      return false
    }
    // Paused (HA "Updates" switch off) — hold the last frame. Checked here
    // because every push path funnels through pushDevice: the clock tick, the
    // photo rotation, view selects, the Refresh button, and the HA data
    // topics. Bail BEFORE rendering so a paused display costs no Chromium
    // render either. `renderDevice` is deliberately not guarded — the HTTP
    // render/preview endpoints stay usable while a panel is paused.
    if (!deviceConfigStore.getIsUpdatesEnabled(deviceId)) {
      console.log(
        `[inkcast] skip ${deviceId} (updates paused)`,
      )
      return false
    }

    const device = deviceById.get(deviceId)
    // Pin the view BEFORE the render. A cold Chromium render of five panels
    // took 15 s on the last deploy, and both the pause switch and the view
    // select can land inside that window.
    const viewAtRenderStart =
      deviceStore.getActiveView(deviceId)
    const platformAtRenderStart =
      getPlatformSelection?.(deviceId)
    // A frame whose key is already held — rendered ahead for a watch, or by
    // a push a moment ago to this or an identical display — is reused, and a
    // render already running for the same key is joined.
    const plan = planFrame({
      deviceId,
      viewName: viewAtRenderStart,
    })
    const startedAt = performance.now()
    const { image, source } = plan?.key
      ? await frames.read({
          deviceId,
          key: plan.key,
          renderFrame: plan.render,
        })
      : {
          image: (await plan?.render()) ?? null,
          source: "rendered" as const,
        }
    if (!plan?.key) {
      frames.forget(deviceId)
    }
    if (!device || !image) {
      return false
    }
    if (
      device.renderOn === "request" ||
      source !== "rendered"
    ) {
      console.log(
        `[inkcast] frame ${deviceId} ${source} in ${Math.round(performance.now() - startedAt)} ms`,
      )
    }

    // Re-check what was true when the render STARTED. The check at the top of
    // this function is seconds stale by now, and on a restart that is exactly
    // when Home Assistant's retained `updates` and `view` land: the boot push
    // read the defaults (updates = on), rendered for 15 s, and published to two
    // displays the owner had paused. They then hold that wrong frame, because a
    // paused display is never pushed to again.
    if (!deviceConfigStore.getIsUpdatesEnabled(deviceId)) {
      console.log(
        `[inkcast] drop ${deviceId} (paused during render)`,
      )
      return false
    }
    if (
      platformAtRenderStart !==
      getPlatformSelection?.(deviceId)
    )
      return false
    const viewNow = deviceStore.getActiveView(deviceId)
    if (viewNow !== viewAtRenderStart) {
      // Whatever changed the view has already queued its own push, so this
      // frame is stale rather than merely late. Publishing it would also make
      // the retained `view` topic disagree with the retained image bytes.
      console.log(
        `[inkcast] drop ${deviceId} (view changed ${viewAtRenderStart} -> ${viewNow} during render)`,
      )
      return false
    }

    const topics = buildDeviceTopics({ baseTopic, device })

    console.log(
      `[inkcast] push ${deviceId} (${viewAtRenderStart}, ${image.length} bytes)`,
    )
    await publisher.publish({
      topic: topics.image,
      payload: image,
      isRetained: true,
    })
    await publisher.publish({
      topic: topics.viewState,
      payload: viewAtRenderStart,
      isRetained: true,
    })
    await publisher.publish({
      topic: topics.lastRender,
      payload: new Date().toISOString(),
      isRetained: true,
    })

    // "http-pull" panels (ESPHome M5Paper) can't consume the MQTT image bytes
    // above — they fetch a PNG over HTTP. Mint a single-use token and publish
    // its URL (non-retained: a consumed/expired token would 404 on reconnect),
    // but skip when the render is byte-identical to the last one we delivered so
    // an idle panel doesn't reflash. `publicUrl` must be set for the URL to be
    // reachable off-host.
    if (device.imageDelivery === "http-pull" && publicUrl) {
      const renderHash = createHash("sha256")
        .update(image)
        .digest("hex")
      if (
        !isForced &&
        lastPublishedHashByDevice.get(deviceId) ===
          renderHash
      ) {
        console.log(
          `[inkcast] skip ${deviceId} image_url (unchanged render)`,
        )
        return true
      }
      const token = renderTokenStore.createToken(image)
      const url = `${publicUrl}/render/${token}.png`
      await publisher.publish({
        topic: topics.imageUrl,
        payload: url,
        isRetained: false,
      })
      lastPublishedHashByDevice.set(deviceId, renderHash)
      console.log(
        `[inkcast] push ${deviceId} image_url ${url}`,
      )
    }

    return true
  }

  const setView = async ({
    deviceId,
    viewName,
  }: {
    deviceId: string
    viewName: ViewName
  }) => {
    if (!deviceById.has(deviceId)) {
      return false
    }

    deviceStore.setActiveView({ deviceId, viewName })
    // Selecting a view is an explicit action, so it renders on every display.
    return pushDevice(deviceId, { isRequested: true })
  }

  return {
    deviceById,
    renderDevice,
    getRenderSettings,
    renderPreview: async ({ deviceId, kind, id }) => {
      const settings = getRenderSettings(deviceId)
      return settings && renderPlatform
        ? renderPlatform({
            ...settings,
            target: { kind, id },
          })
        : null
    },
    pushDevice,
    setView,
    getPrerenderKey,
    prerenderDevice,
  }
}
