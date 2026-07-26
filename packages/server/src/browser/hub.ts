import type { ServerToClientMessage } from "@castkit/shared/protocol/ws"

/**
 * The per-device WebSocket hub for browser-mode (Slatecast) screens. Each
 * kiosk page opens one socket; the server pushes a full `snapshot` on connect
 * (built by the caller) and fans deltas out here. Socket bookkeeping only —
 * message *meaning* lives in browserMode.ts.
 */

/**
 * How often to ping otherwise-idle sockets. This must stay comfortably under
 * the shortest idle timeout between the server and the kiosk: a reverse proxy
 * in front of CastKit closes connections that have been silent too long
 * (nginx's `proxy_read_timeout` is 60 s by default, 90 s under Nginx Proxy
 * Manager), and a quiet house pushes no deltas for hours. Without this a
 * screen's socket is reaped on a fixed cadence all day, every day.
 */
const KEEPALIVE_INTERVAL_MS = 30_000

/** The minimal socket surface the hub needs (matches hono/ws WSContext). */
export type HubSocket = {
  send: (data: string) => void
  /**
   * The adapter's underlying socket. `@hono/node-ws` hands over a `ws`
   * WebSocket, whose `ping()` writes a protocol-level frame that the browser
   * pongs automatically — traffic the proxy counts, invisible to page JS.
   */
  raw?: { ping?: () => void }
}

export type BrowserHub = ReturnType<typeof createBrowserHub>

export const createBrowserHub = ({
  onConnectionCountChange,
  keepaliveIntervalMs = KEEPALIVE_INTERVAL_MS,
}: {
  /** Fires with the new count when a device gains/loses its first/last socket. */
  onConnectionCountChange: (params: {
    deviceId: string
    connectionCount: number
  }) => void
  /** Overridable so a test can drive the keepalive without waiting 30 s. */
  keepaliveIntervalMs?: number
}) => {
  const socketsByDeviceId = new Map<
    string,
    Set<HubSocket>
  >()

  /**
   * Keep every live socket warm. A ping that throws means the socket is
   * already gone; its close handler does the bookkeeping, so swallow it
   * rather than let one dead peer stop the rest of the fleet being pinged.
   */
  const keepaliveInterval = setInterval(() => {
    socketsByDeviceId.forEach((sockets) => {
      sockets.forEach((socket) => {
        try {
          socket.raw?.ping?.()
        } catch {
          // Already dying; removeSocket happens on close.
        }
      })
    })
  }, keepaliveIntervalMs)

  const send = (
    socket: HubSocket,
    message: ServerToClientMessage,
  ) => {
    try {
      socket.send(JSON.stringify(message))
    } catch {
      // A dying socket's close handler does the bookkeeping.
    }
  }

  return {
    addSocket: ({
      deviceId,
      socket,
    }: {
      deviceId: string
      socket: HubSocket
    }) => {
      const sockets =
        socketsByDeviceId.get(deviceId) ?? new Set()
      sockets.add(socket)
      socketsByDeviceId.set(deviceId, sockets)
      onConnectionCountChange({
        deviceId,
        connectionCount: sockets.size,
      })
    },
    removeSocket: ({
      deviceId,
      socket,
    }: {
      deviceId: string
      socket: HubSocket
    }) => {
      const sockets = socketsByDeviceId.get(deviceId)
      if (!sockets?.delete(socket)) {
        return
      }
      onConnectionCountChange({
        deviceId,
        connectionCount: sockets.size,
      })
    },
    sendTo: ({
      socket,
      message,
    }: {
      socket: HubSocket
      message: ServerToClientMessage
    }) => {
      send(socket, message)
    },
    broadcast: ({
      deviceId,
      message,
    }: {
      deviceId: string
      message: ServerToClientMessage
    }) => {
      socketsByDeviceId.get(deviceId)?.forEach((socket) => {
        send(socket, message)
      })
    },
    getConnectionCount: (deviceId: string) =>
      socketsByDeviceId.get(deviceId)?.size ?? 0,
    /** Stops the keepalive so a test (or shutdown) can settle. */
    stop: () => {
      clearInterval(keepaliveInterval)
    },
  }
}
