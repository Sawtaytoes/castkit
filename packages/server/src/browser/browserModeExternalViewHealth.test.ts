import { mkdtempSync, writeFileSync } from "node:fs"
import {
  createServer,
  type Server as HttpServer,
} from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { MqttPublisher } from "@castkit/shared/mqtt/publisher"
import type { ServerToClientMessage } from "@castkit/shared/protocol/ws"
import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { afterEach, expect, test, vi } from "vitest"
import { loadConfig } from "../config/env.ts"
import { createBrowserMode } from "./browserMode.ts"

/**
 * External-view health through the real browser-mode socket: what the panel
 * is told in its snapshot, and the delta it gets when the answer changes.
 */

const DEVICE_ID = "dev-framed"

const cleanups: (() => Promise<void> | void)[] = []

afterEach(async () => {
  await Promise.all(
    cleanups.splice(0).map((cleanup) => cleanup()),
  )
})

const closeServer = (server: HttpServer) =>
  new Promise<void>((resolve) => {
    server.closeAllConnections()
    server.close(() => resolve())
  })

/** A framed application whose health answer the test controls. */
const startFixtureApp = async () => {
  const current = { status: 502 }
  const server = createServer((_request, response) => {
    response.writeHead(current.status)
    response.end()
  })
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve)
  })
  cleanups.push(() => closeServer(server))
  const { port } = server.address() as AddressInfo
  return {
    healthUrl: `http://127.0.0.1:${port}/health`,
    setStatus: (status: number) => {
      current.status = status
    },
  }
}

const disabledPublisher: MqttPublisher = {
  isEnabled: false,
  publish: async () => {},
  subscribe: async () => {},
  close: async () => {},
}

const startBrowserMode = async (healthUrl: string) => {
  const configDir = mkdtempSync(
    join(tmpdir(), "castkit-external-health-test-"),
  )
  const devicesFile = join(configDir, "devices.json")
  writeFileSync(
    devicesFile,
    JSON.stringify([
      {
        renderer: "browser",
        id: DEVICE_ID,
        label: "Dev Framed",
        mac: "aa:bb:cc:dd:ee:03",
        width: 1280,
        height: 720,
        externalViews: [
          {
            name: "Spool App",
            url: "https://example.com/spools",
            healthUrl,
          },
          {
            name: "Disc App",
            url: "https://example.com/discs",
          },
        ],
      },
    ]),
  )
  const browserMode = createBrowserMode({
    config: loadConfig({
      INKCAST_DEVICES_FILE: devicesFile,
    }),
    publisher: disabledPublisher,
    getGlobalClockConfig: () => ({
      isTwelveHour: true,
      isNumericDate: false,
    }),
    externalViewProbe: { intervalMs: 20 },
  })
  cleanups.push(() => browserMode.stop())

  const app = new Hono()
  const { injectWebSocket } = browserMode.attach(app)
  const server = serve({
    fetch: app.fetch,
    hostname: "127.0.0.1",
    port: 0,
  }) as HttpServer
  injectWebSocket(server)
  await new Promise<void>((resolve) => {
    server.once("listening", () => resolve())
  })
  cleanups.push(() => closeServer(server))
  const { port } = server.address() as AddressInfo

  return { browserMode, port }
}

const connectPanel = (port: number) => {
  const messages: ServerToClientMessage[] = []
  const socket = new WebSocket(
    `ws://127.0.0.1:${port}/d/${DEVICE_ID}/ws`,
  )
  socket.addEventListener("message", (event) => {
    messages.push(
      JSON.parse(
        String(event.data),
      ) as ServerToClientMessage,
    )
  })
  cleanups.push(() => socket.close())
  return { messages }
}

test("tells the panel a probed view is not available and never sends the health URL", async () => {
  const { healthUrl } = await startFixtureApp()
  const { port } = await startBrowserMode(healthUrl)

  const { messages } = connectPanel(port)

  await vi.waitFor(() => {
    expect(messages[0]?.type).toBe("snapshot")
  })
  const snapshot = messages[0]
  expect(
    snapshot?.type === "snapshot"
      ? snapshot.device.externalViews
      : null,
  ).toEqual([
    {
      name: "Spool App",
      url: "https://example.com/spools",
      isAvailable: false,
    },
    {
      name: "Disc App",
      url: "https://example.com/discs",
    },
  ])
  expect(JSON.stringify(messages)).not.toContain(healthUrl)
})

test("sends the external views again when the application starts and stops answering", async () => {
  const { healthUrl, setStatus } = await startFixtureApp()
  const { browserMode, port } =
    await startBrowserMode(healthUrl)
  await browserMode.start()
  const { messages } = connectPanel(port)
  await vi.waitFor(() => {
    expect(messages[0]?.type).toBe("snapshot")
  })

  setStatus(200)
  await vi.waitFor(() => {
    expect(messages.slice(1)).toEqual([
      {
        type: "external_views",
        externalViews: [
          {
            name: "Spool App",
            url: "https://example.com/spools",
            isAvailable: true,
          },
          {
            name: "Disc App",
            url: "https://example.com/discs",
          },
        ],
      },
    ])
  })

  setStatus(502)
  await vi.waitFor(() => {
    expect(messages.slice(2)).toEqual([
      {
        type: "external_views",
        externalViews: [
          {
            name: "Spool App",
            url: "https://example.com/spools",
            isAvailable: false,
          },
          {
            name: "Disc App",
            url: "https://example.com/discs",
          },
        ],
      },
    ])
  })
})
