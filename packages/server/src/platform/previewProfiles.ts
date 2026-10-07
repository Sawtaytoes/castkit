import { createHash } from "node:crypto"
import type { PreviewProfile } from "@castkit/shared/panels/previewProfile"
import type { Hono } from "hono"
import type { PushController } from "../pushController.ts"
import type { DeviceDefinitionStore } from "../state/deviceDefinitionStore.ts"
import { getDisplayCompatibility } from "./displayCompatibility.ts"
import type { Platform } from "./platform.ts"

/** Group installed displays by rendering facts, independent of identity and content. */
export const getPreviewProfiles = ({
  definitions,
  platform,
  pushController,
}: {
  definitions: DeviceDefinitionStore
  platform: Platform
  pushController: PushController
}) => {
  const groups = new Map<string, PreviewProfile>()
  definitions.getAll().forEach((definition) => {
    const properties = platform.getDeviceProperties(
      definition.id,
    )
    if (!properties) return
    const settings =
      properties.delivery === "image"
        ? pushController.getRenderSettings(definition.id)
        : null
    const device = settings?.device
    const facts = {
      ...properties,
      rotation:
        device?.rotation ?? definition.rotation ?? 0,
      shape:
        "shape" in definition
          ? definition.shape
          : "rectangle",
      colorMode: device?.colorMode ?? properties.colorMode,
      palette: device?.palette,
      ditherProfile: device?.ditherProfile,
      margin: settings?.margin,
      adjustments: settings?.adjustments,
    }
    const id = createHash("sha256")
      .update(JSON.stringify(facts))
      .digest("hex")
      .slice(0, 16)
    const previous = groups.get(id)
    const colorLabel = {
      monochrome: "Black and white",
      grayscale: "Grayscale",
      spectra6: "E6 color",
      full: "Full color",
    }[facts.colorMode ?? "full"]
    const details = [
      facts.shape !== "rectangle" ? facts.shape : "",
      properties.hasTouch ? "Touch" : "",
      properties.power === "battery" ? "Battery" : "",
      properties.hasViewDrawer ? "View drawer" : "",
      settings?.margin
        ? `Margins ${JSON.stringify(settings.margin)}`
        : "",
      settings?.adjustments
        ? `Adjustments ${JSON.stringify(settings.adjustments)}`
        : "",
      device?.ditherProfile.supersampleFactor
        ? `${device.ditherProfile.supersampleFactor}× supersampling`
        : "",
    ]
      .filter(Boolean)
      .join(" · ")
    const label = `${properties.width} × ${properties.height} · ${colorLabel} · ${properties.delivery === "image" ? `Rendered image · ${device?.ditherProfile.algorithm ?? "off"} · ${properties.repaint}` : "Live browser"}${facts.rotation ? ` · ${facts.rotation}°` : ""}${details ? ` · ${details}` : ""}`
    groups.set(
      id,
      previous
        ? {
            ...previous,
            deviceLabels: previous.deviceLabels.concat(
              definition.label,
            ),
            deviceIds: previous.deviceIds.concat(
              definition.id,
            ),
          }
        : {
            id,
            label,
            width: properties.width,
            height: properties.height,
            delivery: properties.delivery,
            deviceId: definition.id,
            deviceLabels: [definition.label],
            deviceIds: [definition.id],
            unsupportedViews: Object.fromEntries(
              platform.store.get().views.flatMap((view) => {
                const compatibility =
                  getDisplayCompatibility({
                    view,
                    display: properties,
                    catalog: platform.catalog,
                  })
                return compatibility.isCompatible
                  ? []
                  : [[view.id, compatibility.reasons]]
              }),
            ),
          },
    )
  })
  return Array.from(groups.values())
}

/** Read-only previews use the delivery renderer and never assign or publish a view. */
export const attachPreviewRoutes = ({
  app,
  platform,
  definitions,
  pushController,
}: {
  app: Hono
  platform: Platform
  definitions: DeviceDefinitionStore
  pushController: PushController
}) => {
  const state = {
    tail: Promise.resolve(),
    cache: new Map<
      string,
      {
        promise: Promise<Buffer | null>
        consumers: Set<AbortSignal>
      }
    >(),
  }
  app.get("/api/manage/preview-profiles", (context) =>
    context.json({
      profiles: getPreviewProfiles({
        definitions,
        platform,
        pushController,
      }),
    }),
  )
  app.get(
    "/api/manage/previews/:deviceId/:kind/:id",
    async (context) => {
      const deviceId = context.req.param("deviceId")
      const kind = context.req.param("kind")
      if (kind !== "view" && kind !== "screen")
        return context.json(
          { error: "Unknown preview kind" },
          404,
        )
      const id = context.req.param("id")
      const view = platform.getTarget({ kind, id })?.view
      const display = platform.getDeviceProperties(deviceId)
      if (!view || !display)
        return context.json(
          { error: "Unknown view or display" },
          404,
        )
      const compatibility = getDisplayCompatibility({
        view,
        display,
        catalog: platform.catalog,
      })
      if (!compatibility.isCompatible)
        return context.json(
          { error: compatibility.reasons.join(" ") },
          422,
        )
      if (display.delivery !== "image")
        return context.json(
          {
            error:
              "This display uses live browser previews.",
          },
          400,
        )
      const key = createHash("sha256")
        .update(
          JSON.stringify({
            settings:
              pushController.getRenderSettings(deviceId),
            view,
            channels: platform.channelsForView(view),
            photos: view.panels
              .filter(
                (panel) => panel.specId === "photo-frame",
              )
              .map((panel) =>
                Math.floor(
                  Date.now() /
                    (Math.max(
                      5,
                      Number(
                        panel.settings.intervalSeconds ??
                          Number(
                            panel.settings
                              .photoIntervalMinutes ?? 5,
                          ) * 60,
                      ),
                    ) *
                      1000),
                ),
              ),
            minute: view.panels.some((panel) =>
              ["clock", "ambient"].includes(panel.specId),
            )
              ? Math.floor(Date.now() / 60000)
              : undefined,
            refresh: context.req.query("revision") ?? "0",
          }),
        )
        .digest("hex")
      if (!state.cache.has(key)) {
        const consumers = new Set<AbortSignal>()
        const pending = state.tail.then(() => {
          if (
            Array.from(consumers).every(
              (signal) => signal.aborted,
            )
          ) {
            state.cache.delete(key)
            return null
          }
          return pushController.renderPreview({
            deviceId,
            kind,
            id,
          })
        })
        state.tail = pending.then(
          () => {},
          () => {},
        )
        state.cache.set(key, {
          promise: pending,
          consumers,
        })
        if (state.cache.size > 64)
          state.cache.delete(
            state.cache.keys().next().value!,
          )
        void pending.catch(() => state.cache.delete(key))
      }
      const work = state.cache.get(key)!
      work.consumers.add(context.req.raw.signal)
      try {
        const image = await work.promise
        if (!image) state.cache.delete(key)
        return image
          ? context.body(new Uint8Array(image), 200, {
              "Content-Type": "image/png",
              "Cache-Control": "no-store",
            })
          : context.json(
              { error: "Preview renderer is unavailable" },
              503,
            )
      } catch {
        return context.json(
          {
            error:
              "The preview could not be rendered. Try Refresh.",
          },
          503,
        )
      } finally {
        work.consumers.delete(context.req.raw.signal)
      }
    },
  )
}
