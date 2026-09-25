import { Hono } from "hono"
import {
  defineWebSocketHelper,
  WSContext,
  type WSEvents,
} from "hono/ws"
import { afterEach, expect, test, vi } from "vitest"
import type WebSocket from "ws"
import type { Platform } from "./platform.ts"
import { attachPlatformSockets } from "./platformSockets.ts"

vi.mock("./platformRoutes.ts", () => ({
  getDisplay: () => ({
    snapshot: { view: { id: "quiet" }, channels: {} },
  }),
}))
afterEach(() => vi.useRealTimers())

const connect = async (kind: "view" | "screen") => {
  const app = new Hono()
  const captured: { events?: WSEvents<WebSocket> } = {}
  const unsubscribe = vi.fn()
  attachPlatformSockets({
    app,
    platform: {
      access: { isSameOrigin: () => true },
      subscribe: () => unsubscribe,
    } as unknown as Platform,
    upgradeWebSocket: defineWebSocketHelper(
      (_context, events) => {
        captured.events = events
        return new Response("Connected")
      },
    ),
  })
  await app.request(`/${kind}/quiet/ws`)
  const send = vi.fn()
  const ping = vi.fn()
  const raw = { ping } as unknown as WebSocket
  const socket = new WSContext({
    send,
    close: vi.fn(),
    readyState: 1,
    raw,
  })
  captured.events?.onOpen?.(new Event("open"), socket)
  return {
    events: captured.events,
    socket,
    send,
    ping,
    unsubscribe,
  }
}

test.each([
  "view",
  "screen",
] as const)("a quiet %s stays alive without resending unchanged data", async (kind) => {
  vi.useFakeTimers()
  const connection = await connect(kind)
  vi.advanceTimersByTime(90_000)
  expect(connection.send).toHaveBeenCalledTimes(1)
  expect(connection.ping).toHaveBeenCalledTimes(3)
  connection.events?.onClose?.(
    {} as CloseEvent,
    connection.socket,
  )
  vi.advanceTimersByTime(60_000)
  expect(connection.ping).toHaveBeenCalledTimes(3)
  expect(connection.unsubscribe).toHaveBeenCalledTimes(1)
})

test("an errored connection cancels its timers", async () => {
  vi.useFakeTimers()
  const connection = await connect("view")
  connection.events?.onError?.(
    new Event("error"),
    connection.socket,
  )
  vi.advanceTimersByTime(90_000)
  expect(connection.ping).not.toHaveBeenCalled()
  expect(connection.unsubscribe).toHaveBeenCalledTimes(1)
})
