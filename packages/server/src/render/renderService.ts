import type { DeviceMetadata } from "@inkcast/core/devices/device"
import { createChromiumEngine } from "@inkcast/render/chromiumEngine"
import { renderDeviceImage } from "@inkcast/render/renderDeviceImage"
import { createSatoriEngine } from "@inkcast/render/satoriEngine"
import {
  renderViewElement,
  type ViewName,
} from "../views/registry.ts"

/**
 * Holds the configured render engine and turns a (device, view) into that
 * device's panel-ready PNG. The engine is chosen at startup — Chromium (default)
 * or Satori — and reused across renders.
 */
export type RenderService = {
  renderDevice: (params: {
    device: DeviceMetadata
    viewName: ViewName
  }) => Promise<Buffer>
  close: () => Promise<void>
}

export const createRenderService = async ({
  engineName,
}: {
  engineName: "chromium" | "satori"
}): Promise<RenderService> => {
  if (engineName === "satori") {
    const engine = await createSatoriEngine()

    return {
      renderDevice: ({ device, viewName }) =>
        renderDeviceImage({
          engine,
          element: renderViewElement({
            viewName,
            device,
            now: new Date(),
          }),
          device,
        }),
      close: async () => {},
    }
  }

  const engine = await createChromiumEngine()

  return {
    renderDevice: ({ device, viewName }) =>
      renderDeviceImage({
        engine,
        element: renderViewElement({
          viewName,
          device,
          now: new Date(),
        }),
        device,
      }),
    close: () => engine.close(),
  }
}
