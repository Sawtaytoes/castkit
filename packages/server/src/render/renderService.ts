import type { DeviceMetadata } from "@castkit/core/devices/device"
import type { PanelMargin } from "@castkit/core/panels/safeArea"
import { resolveSafeArea } from "@castkit/core/panels/safeArea"
import type {
  DitherAdjustments,
  FullColorEncoding,
} from "@castkit/core/pipeline/dither"
import { createChromiumEngine } from "@castkit/render/chromiumEngine"
import type { RenderEngine } from "@castkit/render/engine"
import { renderDeviceImage } from "@castkit/render/renderDeviceImage"
import { createSatoriEngine } from "@castkit/render/satoriEngine"
import type { ViewName } from "@castkit/shared/views/viewNames"
import { createElement } from "react"
import type {
  AgendaData,
  NowPlayingData,
  PhotoFrameData,
  WeatherData,
} from "../state/viewDataStore.ts"
import {
  type ClockConfig,
  renderViewElement,
} from "../views/registry.ts"
import { createIdleClosingBrowser } from "./idleClosingBrowser.ts"

/**
 * Holds the configured render engine and turns a (device, view, view data)
 * into that device's panel-ready PNG.
 *
 * - `satori` (default): the image views render with Satori inside this
 *   process. Chromium is only needed to capture a platform page
 *   (`renderPage`), so it is launched on demand and closed after
 *   `browserIdleCloseMilliseconds` without a capture.
 * - `chromium`: one long-lived browser renders both.
 */
export type RenderService = {
  renderDevice: (params: {
    device: DeviceMetadata
    viewName: ViewName
    clock: ClockConfig
    nowPlaying?: NowPlayingData
    photoFrame?: PhotoFrameData
    weather?: WeatherData
    agenda?: AgendaData
    adjustments?: DitherAdjustments
    margin?: PanelMargin
    fullColorEncoding?: FullColorEncoding
  }) => Promise<Buffer>
  renderPage: (params: {
    device: DeviceMetadata
    url: string
    headers?: Record<string, string>
    margin?: PanelMargin
    adjustments?: DitherAdjustments
  }) => Promise<Buffer>
  close: () => Promise<void>
}

/** Long enough that a display captured once a minute keeps its browser. */
const DEFAULT_BROWSER_IDLE_CLOSE_MILLISECONDS = 120_000

export const createRenderService = async ({
  engineName,
  browserIdleCloseMilliseconds = DEFAULT_BROWSER_IDLE_CLOSE_MILLISECONDS,
}: {
  engineName: "chromium" | "satori"
  browserIdleCloseMilliseconds?: number
}): Promise<RenderService> => {
  // Satori has no resources to release, so `close` only exists on Chromium.
  const engine: RenderEngine & {
    close?: () => Promise<void>
  } =
    engineName === "satori"
      ? await createSatoriEngine()
      : await createChromiumEngine()

  const pageBrowser =
    engineName === "satori"
      ? createIdleClosingBrowser({
          launch: createChromiumEngine,
          idleCloseMilliseconds:
            browserIdleCloseMilliseconds,
        })
      : null

  const renderUrl =
    pageBrowser?.renderUrl ?? engine.renderUrl

  return {
    renderDevice: ({
      device,
      viewName,
      clock,
      nowPlaying,
      photoFrame,
      weather,
      agenda,
      adjustments,
      margin,
      fullColorEncoding,
    }) => {
      // The view must be laid out in the safe box (device minus the mat
      // inset), not the full panel, so its text reflows to what stays
      // visible. renderDeviceImage places that render onto the full panel.
      const { contentWidth, contentHeight } =
        resolveSafeArea({
          width: device.width,
          height: device.height,
          margin,
        })
      const contentDevice: DeviceMetadata = {
        ...device,
        width: contentWidth,
        height: contentHeight,
      }

      return renderDeviceImage({
        engine,
        element: renderViewElement({
          viewName,
          device: contentDevice,
          now: new Date(),
          clock,
          nowPlaying,
          photoFrame,
          weather,
          agenda,
        }),
        device,
        adjustments,
        margin,
        fullColorEncoding,
      })
    },
    renderPage: async ({
      device,
      url,
      headers,
      margin,
      adjustments,
    }) => {
      if (!renderUrl)
        throw new Error(
          "Composed views on image displays need a browser to capture them",
        )
      return renderDeviceImage({
        device,
        margin,
        adjustments,
        element: createElement("div"),
        engine: {
          name: "chromium",
          render: ({ width, height, supersampleFactor }) =>
            renderUrl({
              url,
              headers,
              width,
              height,
              supersampleFactor,
            }),
        },
        fullColorEncoding: { format: "png" },
      })
    },
    close: async () => {
      await pageBrowser?.close()
      await engine.close?.()
    },
  }
}
