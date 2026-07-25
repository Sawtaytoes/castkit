import type { DeviceCommand } from "@castkit/shared/protocol/commands"
import type {
  ClientToServerMessage,
  ServerToClientMessage,
} from "@castkit/shared/protocol/ws"
import { setupWorker } from "msw/browser"
import { ws } from "msw/core/ws"

/**
 * A stand-in for the CastKit server's `/d/<id>/ws` endpoint, built on MSW's
 * WebSocket link. Tests drive the real client code — `connect()` opens a real
 * `WebSocket`, MSW intercepts it — so the snapshot/delta protocol and the
 * command path are exercised end to end rather than stubbed.
 *
 * The link pattern is host-agnostic (a leading wildcard) because Vitest's
 * browser runner serves each file from an ephemeral port.
 *
 * WebSocket interception does not go through MSW's service worker, so no
 * `mockServiceWorker.js` is needed. Adding HTTP handlers here later WOULD
 * require generating one.
 */
export const createSlatecastServer = () => {
  const link = ws.link("*/d/:deviceId/ws")
  const commands: DeviceCommand[] = []
  const connections: { client: WsClient | null } = {
    client: null,
  }

  const worker = setupWorker(
    link.addEventListener("connection", ({ client }) => {
      connections.client = client
      client.addEventListener("message", (event) => {
        const message = JSON.parse(
          String(event.data),
        ) as ClientToServerMessage
        if (message.type === "command") {
          commands.push(message.command)
        }
      })
    }),
  )

  return {
    /** Every `DeviceCommand` the client has published, in order. */
    commands,

    start: async () => {
      await worker.start({
        quiet: true,
        onUnhandledRequest: "bypass",
      })
    },

    stop: () => {
      worker.stop()
    },

    /** Resolves once the client's socket has connected. */
    waitForConnection: async () => {
      await waitUntil(() => connections.client !== null)
    },

    /** Push a server→client frame, exactly as the real server would. */
    push: (message: ServerToClientMessage) => {
      connections.client?.send(JSON.stringify(message))
    },

    /** Drop the socket, so reconnect behaviour can be asserted. */
    closeConnection: () => {
      connections.client?.close()
      connections.client = null
    },
  }
}

type WsClient = {
  send: (data: string) => void
  close: () => void
  addEventListener: (
    type: "message",
    listener: (event: { data: unknown }) => void,
  ) => void
}

/**
 * Poll until `isReady`. Frames cross a real socket, so there is no synchronous
 * point to await — and Testing Library's `waitFor` only covers DOM state.
 */
export const waitUntil = async (
  isReady: () => boolean,
  { timeoutMs = 2_000 }: { timeoutMs?: number } = {},
) => {
  const startedAtMs = Date.now()
  const poll = async (): Promise<void> => {
    if (isReady()) {
      return
    }
    if (Date.now() - startedAtMs > timeoutMs) {
      throw new Error(
        `waitUntil timed out after ${timeoutMs}ms`,
      )
    }
    await new Promise((resolve) => setTimeout(resolve, 5))
    return poll()
  }
  return poll()
}
