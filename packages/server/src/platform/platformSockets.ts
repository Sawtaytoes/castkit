import type { NodeWebSocket } from "@hono/node-ws"
import type { Hono } from "hono"
import type { WSContext } from "hono/ws"
import type { Platform } from "./platform.ts"
import { getDisplay } from "./platformRoutes.ts"

/** One socket per display; every send rechecks the grant and active composition. */
export const attachPlatformSockets = ({
  app,
  platform,
  upgradeWebSocket,
}: {
  app: Hono
  platform: Platform
  upgradeWebSocket: NodeWebSocket["upgradeWebSocket"]
}) => {
  ;(["view", "screen"] as const).forEach((kind) => {
    app.get(
      `/${kind}/:id/ws`,
      async (context, next) => {
        if (!platform.access.isSameOrigin(context))
          return context.json(
            {
              error: "Cross-origin sockets are not allowed",
            },
            403,
          )
        const result = getDisplay({
          platform,
          context,
          kind,
          id: context.req.param("id"),
        })
        if (!("snapshot" in result))
          return context.json(result, result.status)
        await next()
      },
      upgradeWebSocket((context) => {
        const lifecycle: {
          unsubscribe?: () => void
          timer?: ReturnType<typeof setInterval>
          keepalive?: ReturnType<typeof setInterval>
          socket?: WSContext
          previous?: string
          isClosed: boolean
        } = { isClosed: false }
        const dispose = () => {
          lifecycle.isClosed = true
          lifecycle.unsubscribe?.()
          clearInterval(lifecycle.timer)
          clearInterval(lifecycle.keepalive)
        }
        const send = () => {
          if (lifecycle.isClosed || !lifecycle.socket)
            return
          const result = getDisplay({
            platform,
            context,
            kind,
            id: context.req.param("id") ?? "",
          })
          if (!("snapshot" in result)) {
            lifecycle.socket.send(
              JSON.stringify({
                type:
                  result.status === 409
                    ? "reload"
                    : "locked",
              }),
            )
            lifecycle.socket.close(
              result.status === 401 ? 4401 : 4404,
            )
            dispose()
            return
          }
          const payload = JSON.stringify({
            type: "snapshot",
            ...result.snapshot,
          })
          if (payload !== lifecycle.previous) {
            lifecycle.socket.send(payload)
            lifecycle.previous = payload
          }
        }
        return {
          onOpen: (_event, socket) => {
            lifecycle.socket = socket
            lifecycle.unsubscribe = platform.subscribe(send)
            lifecycle.timer = setInterval(send, 1000)
            lifecycle.timer.unref()
            // Unchanged snapshots send no traffic. Keep quiet pages below the proxy's idle timeout.
            lifecycle.keepalive = setInterval(() => {
              try {
                const raw = socket.raw as
                  | { ping?: () => void }
                  | undefined
                raw?.ping?.()
              } catch {
                dispose()
              }
            }, 30_000)
            lifecycle.keepalive.unref()
            send()
          },
          onClose: dispose,
          onError: dispose,
        }
      }),
    )
  })
}
