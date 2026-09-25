import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest"
import { createBrowserHub } from "./hub.ts"

const buildSocket = () => ({
  send: vi.fn(),
  raw: { ping: vi.fn() },
})

const buildHub = (keepaliveIntervalMs: number) =>
  createBrowserHub({
    onConnectionCountChange: () => {},
    keepaliveIntervalMs,
  })

/**
 * A reverse proxy in front of CastKit closes connections that go quiet
 * (nginx's `proxy_read_timeout`), and a house with nothing playing sends no
 * deltas for hours — so the hub, not the traffic, has to keep sockets alive.
 * Without this a display is silently disconnected on a fixed cadence all day.
 */
describe("keepalive", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test("pings a live socket on every interval", () => {
    const hub = buildHub(1_000)
    const socket = buildSocket()
    hub.addSocket({ deviceId: "square", socket })

    vi.advanceTimersByTime(3_000)

    expect(socket.raw.ping).toHaveBeenCalledTimes(3)
    hub.stop()
  })

  test("stops pinging a socket that has been removed", () => {
    const hub = buildHub(1_000)
    const socket = buildSocket()
    hub.addSocket({ deviceId: "square", socket })

    vi.advanceTimersByTime(1_000)
    hub.removeSocket({ deviceId: "square", socket })
    vi.advanceTimersByTime(3_000)

    expect(socket.raw.ping).toHaveBeenCalledTimes(1)
    hub.stop()
  })

  test("one dead socket cannot starve the rest of the fleet", () => {
    const hub = buildHub(1_000)
    const deadSocket = buildSocket()
    deadSocket.raw.ping.mockImplementation(() => {
      throw new Error("socket already closed")
    })
    const liveSocket = buildSocket()
    hub.addSocket({
      deviceId: "square",
      socket: deadSocket,
    })
    hub.addSocket({
      deviceId: "circle",
      socket: liveSocket,
    })

    vi.advanceTimersByTime(2_000)

    expect(liveSocket.raw.ping).toHaveBeenCalledTimes(2)
    hub.stop()
  })

  test("stop() ends the keepalive", () => {
    const hub = buildHub(1_000)
    const socket = buildSocket()
    hub.addSocket({ deviceId: "square", socket })

    hub.stop()
    vi.advanceTimersByTime(5_000)

    expect(socket.raw.ping).not.toHaveBeenCalled()
  })
})

test("a preview receives broadcasts without changing physical connection counts", () => {
  const onConnectionCountChange = vi.fn()
  const hub = createBrowserHub({ onConnectionCountChange })
  const preview = buildSocket()
  const panel = buildSocket()
  hub.addSocket({
    deviceId: "square",
    socket: preview,
    isObserver: true,
  })
  expect(hub.getConnectionCount("square")).toBe(0)
  expect(onConnectionCountChange).not.toHaveBeenCalled()
  hub.addSocket({ deviceId: "square", socket: panel })
  expect(hub.getConnectionCount("square")).toBe(1)
  hub.broadcast({
    deviceId: "square",
    message: { type: "reload" },
  })
  expect(preview.send).toHaveBeenCalledWith(
    JSON.stringify({ type: "reload" }),
  )
  hub.removeSocket({ deviceId: "square", socket: panel })
  expect(hub.getConnectionCount("square")).toBe(0)
  expect(onConnectionCountChange).toHaveBeenLastCalledWith({
    deviceId: "square",
    connectionCount: 0,
  })
  hub.removeSocket({ deviceId: "square", socket: preview })
  expect(onConnectionCountChange).toHaveBeenCalledTimes(2)
  hub.stop()
})
