import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type {
  CommandHandler,
  MqttPublisher,
} from "@castkit/shared/mqtt/publisher"
import { serve } from "@hono/node-server"
import { createApp } from "../packages/server/src/app.ts"
import { createBrowserMode } from "../packages/server/src/browser/browserMode.ts"
import { loadConfig } from "../packages/server/src/config/env.ts"
import { createPlatform } from "../packages/server/src/platform/platform.ts"
import { attachPlatformSockets } from "../packages/server/src/platform/platformSockets.ts"
import { hashPin } from "../packages/server/src/platform/platformStore.ts"
import { createDeviceDefinitionStore } from "../packages/server/src/state/deviceDefinitionStore.ts"
import { createDeviceStore } from "../packages/server/src/state/deviceStore.ts"
import { createRenderTokenStore } from "../packages/server/src/state/renderTokenStore.ts"

/**
 * Boots the REAL CastKit server — real page shell, real `/d/<id>/ws` hub, real
 * command→MQTT bridge — with the broker swapped for a recording stub.
 *
 * The component suite mocks the socket to test the client in isolation; this
 * layer exists to cover what that necessarily stubs out: the server's snapshot
 * assembly, the WebSocket upgrade, and the device→MQTT command path.
 *
 * Two control routes let a spec play the part of Home Assistant. They live
 * here, in the e2e harness, and never ship in the server.
 */

export const E2E_DEVICE_ID = "e2e-square"

/** Pinned rather than left to the env default, so the specs read literally. */
export const E2E_BASE_TOPIC = "castkit"

export const e2eTopics = {
  nowPlaying: `${E2E_BASE_TOPIC}/${E2E_DEVICE_ID}/now_playing/set`,
  queue: `${E2E_BASE_TOPIC}/${E2E_DEVICE_ID}/queue/set`,
  view: `${E2E_BASE_TOPIC}/${E2E_DEVICE_ID}/view/set`,
  command: `${E2E_BASE_TOPIC}/${E2E_DEVICE_ID}/command`,
}

/** Captures publishes and exposes the server's own subscribe handlers. */
const createRecordingPublisher = () => {
  const published: {
    topic: string
    payload: string
  }[] = []
  const handlers: CommandHandler[] = []

  const publisher: MqttPublisher = {
    isEnabled: true,
    publish: async ({ topic, payload }) => {
      published.push({
        topic,
        payload:
          typeof payload === "string"
            ? payload
            : Buffer.from(payload).toString("base64"),
      })
    },
    subscribe: async ({ handler }) => {
      handlers.push(handler)
    },
    close: async () => {},
  }

  return { publisher, published, handlers }
}

export const startTestServer = async ({
  port,
}: {
  port: number
}) => {
  const configDir = mkdtempSync(
    join(tmpdir(), "castkit-e2e-"),
  )
  const devicesFile = join(configDir, "devices.json")
  writeFileSync(
    devicesFile,
    JSON.stringify([
      {
        renderer: "browser",
        id: E2E_DEVICE_ID,
        label: "E2E Square",
        mac: "aa:bb:cc:dd:ee:ff",
        width: 720,
        height: 720,
        shape: "square",
        hasTouch: true,
        hasViewDrawer: true,
        color: "full",
        externalViews: [
          {
            name: "Disc App",
            url: `http://localhost:${port}/__test__/external`,
          },
        ],
      },
      {
        renderer: "browser",
        id: "e2e-preview",
        label: "Preview test display",
        mac: "02:00:00:00:00:03",
        width: 720,
        height: 720,
        shape: "square",
        hasTouch: true,
        color: "full",
      },
    ]),
  )

  const config = loadConfig({
    PORT: String(port),
    INKCAST_DEVICES_FILE: devicesFile,
    CASTKIT_PUBLIC_URL: `http://localhost:${port}`,
    MQTT_BASE_TOPIC: E2E_BASE_TOPIC,
  })

  const { publisher, published, handlers } =
    createRecordingPublisher()
  const browserMode = createBrowserMode({
    config,
    publisher,
    getGlobalClockConfig: () => ({
      isTwelveHour: true,
      isNumericDate: false,
    }),
  })
  await browserMode.start()

  const platform = await createPlatform({
    publisher,
    browserDevices: config.browserDevices,
  })
  platform.store.update((previous) => ({
    ...previous,
    adminHash: hashPin("2468"),
    sources: [
      {
        id: "events",
        name: "Events",
        adapter: "mqtt",
        settings: {},
        isEnabled: true,
      },
    ],
    channels: [
      {
        id: "printers/lab",
        name: "Lab printers",
        sourceId: "events",
        type: "printers.v1",
        settings: {},
      },
    ],
    views: [
      {
        id: "lab",
        name: "Lab",
        layout: "split",
        theme: "dark",
        access: "public",
        isControlEnabled: false,
        panels: [
          {
            id: "printers",
            specId: "printer-status",
            bindings: { data: "printers/lab" },
            settings: {},
          },
          {
            id: "time",
            specId: "clock",
            bindings: {} as Record<string, string>,
            settings: {},
          },
        ],
      },
      {
        id: "private-lab",
        name: "Private lab",
        layout: "single",
        theme: "dark",
        access: "pin",
        isControlEnabled: false,
        panels: [
          {
            id: "printers",
            specId: "printer-status",
            bindings: { data: "printers/lab" },
            settings: {},
          },
        ],
      },
    ],
    screens: [
      {
        id: "desktop",
        name: "Desktop",
        access: "public",
        defaultViewId: "lab",
        viewIds: ["lab"],
      },
    ],
    pinHashes: { "view:private-lab": hashPin("1357") },
  }))
  await platform.refresh()
  const app = createApp({
    config,
    platform,
    deviceStore: createDeviceStore({ deviceIds: [] }),
    deviceDefinitionStore: createDeviceDefinitionStore({
      devices: config.devices,
      browserDevices: config.browserDevices,
      devicesFile,
    }),
    getDeviceSettings: browserMode.getDeviceSettings,
    onDeviceDefinitionsChanged: () => {},
    setDeviceSetting: browserMode.setDeviceSetting,
    pushController: {
      deviceById: new Map(),
      renderDevice: async () => null,
      pushDevice: async () => false,
      setView: async () => false,
    },
    renderTokenStore: createRenderTokenStore(),
  })

  // Stand in for Home Assistant publishing to a topic the server subscribed to.
  app.post("/__test__/mqtt", async (context) => {
    const { topic, payload } =
      (await context.req.json()) as {
        topic: string
        payload: unknown
      }
    await Promise.all(
      handlers.map((handler) =>
        handler({
          topic,
          payload:
            typeof payload === "string"
              ? payload
              : JSON.stringify(payload),
        }),
      ),
    )
    return context.json({ ok: true })
  })

  // Everything the server has published to the broker, for command assertions.
  app.get("/__test__/published", (context) =>
    context.json(published),
  )
  app.get("/__test__/external", (context) =>
    context.html(
      '<button type="button">External control</button>',
    ),
  )

  const { injectWebSocket, upgradeWebSocket } =
    browserMode.attach(app, {
      getPlatformScreenId: (deviceId) =>
        platform.store.get().deviceScreens[deviceId],
    })
  attachPlatformSockets({ app, platform, upgradeWebSocket })
  const server = serve({ fetch: app.fetch, port })
  injectWebSocket(server)

  return {
    close: async () => {
      platform.dispose()
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve()
        })
      })
    },
  }
}
