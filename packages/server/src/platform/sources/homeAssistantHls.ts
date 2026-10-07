import { randomUUID } from "node:crypto"
import type { SourceContext } from "@castkit/sdk/plugin"
import { sourceRequest, sourceUrl } from "./http.ts"

const SESSION_IDLE_MILLISECONDS = 30 * 60_000
const REQUEST_TIMEOUT_MILLISECONDS = 20_000
const hlsQueryKeys = ["_HLS_msn", "_HLS_part", "_HLS_skip"]

type Session = {
  entityId: string
  prefix: string
  lastAccessAt: number
}

/** Ask HA to start a camera stream without giving its API token to a browser. */
export const requestHomeAssistantStream = ({
  baseUrl,
  token,
  entityId,
  signal,
}: {
  baseUrl: string
  token: string
  entityId: string
  signal: AbortSignal
}) =>
  new Promise<string>((resolve, reject) => {
    const endpoint = new URL(
      sourceUrl({ baseUrl, path: "/api/websocket" }),
    )
    endpoint.protocol =
      endpoint.protocol === "https:" ? "wss:" : "ws:"
    const socket = new WebSocket(endpoint)
    let isSettled = false
    const finish = (error?: Error, url?: string) => {
      if (isSettled) return
      isSettled = true
      clearTimeout(timer)
      signal.removeEventListener("abort", onAbort)
      socket.close()
      if (error) reject(error)
      else resolve(url ?? "")
    }
    const onAbort = () =>
      finish(new Error("Camera request canceled."))
    const timer = setTimeout(
      () =>
        finish(
          new Error(
            "Home Assistant camera request timed out.",
          ),
        ),
      REQUEST_TIMEOUT_MILLISECONDS,
    )
    signal.addEventListener("abort", onAbort, {
      once: true,
    })
    socket.addEventListener("error", () =>
      finish(
        new Error(
          "Home Assistant camera connection failed.",
        ),
      ),
    )
    socket.addEventListener("close", () =>
      finish(
        new Error(
          "Home Assistant camera connection closed.",
        ),
      ),
    )
    socket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(
          String(event.data),
        ) as Record<string, unknown>
        if (message.type === "auth_required") {
          socket.send(
            JSON.stringify({
              type: "auth",
              access_token: token,
            }),
          )
        } else if (message.type === "auth_ok") {
          socket.send(
            JSON.stringify({
              id: 1,
              type: "camera/stream",
              entity_id: entityId,
              format: "hls",
            }),
          )
        } else if (message.type === "auth_invalid") {
          finish(
            new Error(
              "Home Assistant rejected the camera token.",
            ),
          )
        } else if (
          message.type === "result" &&
          message.id === 1
        ) {
          const result = message.result as
            | Record<string, unknown>
            | undefined
          if (
            message.success &&
            typeof result?.url === "string"
          )
            finish(undefined, result.url)
          else
            finish(
              new Error(
                "Home Assistant could not start this camera.",
              ),
            )
        }
      } catch {
        finish(
          new Error(
            "Invalid Home Assistant camera response.",
          ),
        )
      }
    })
    if (signal.aborted) onAbort()
  })

/** Proxy one HA HLS session through CastKit's existing media access policy. */
export const createHomeAssistantHls = (
  context: SourceContext,
  headers: Record<string, string>,
) => {
  const sessions = new Map<string, Session>()
  const clearExpired = () => {
    const now = Date.now()
    for (const [id, session] of sessions) {
      if (
        now - session.lastAccessAt >
        SESSION_IDLE_MILLISECONDS
      )
        sessions.delete(id)
    }
  }
  const fetchResource = async ({
    assetId,
    query,
  }: {
    assetId: string
    query: Record<string, string>
  }) => {
    clearExpired()
    let sessionId = query.session
    let session = sessionId
      ? sessions.get(sessionId)
      : undefined
    let resource = query.resource
    if (!sessionId && !resource) {
      const url = await requestHomeAssistantStream({
        baseUrl: String(context.source.settings.url),
        token: context.secrets.token ?? "",
        entityId: assetId,
        signal: context.signal,
      })
      const parsed = new URL(
        url,
        sourceUrl({
          baseUrl: context.source.settings.url,
          path: "/",
        }),
      )
      const configuredOrigin = new URL(
        String(context.source.settings.url),
      ).origin
      const match =
        /^\/api\/hls\/[a-f0-9]+\/(master_playlist\.m3u8)$/.exec(
          parsed.pathname,
        )
      if (
        parsed.origin !== configuredOrigin ||
        !match ||
        parsed.search
      )
        throw new Error(
          "Home Assistant returned an invalid camera stream URL.",
        )
      sessionId = randomUUID()
      session = {
        entityId: assetId,
        prefix: parsed.pathname.slice(0, -match[1]?.length),
        lastAccessAt: Date.now(),
      }
      sessions.set(sessionId, session)
      resource = match[1]
    }
    if (
      !session ||
      session.entityId !== assetId ||
      !sessionId
    )
      throw new Error("Unknown camera stream session.")
    if (
      !resource ||
      resource.startsWith("/") ||
      resource.includes("..") ||
      !/^[a-zA-Z0-9_./-]+$/.test(resource) ||
      !/\.(m3u8|mp4|m4s)$/.test(resource)
    )
      throw new Error("Invalid camera stream resource.")
    session.lastAccessAt = Date.now()
    const parameters = new URLSearchParams()
    for (const key of hlsQueryKeys) {
      const value = query[key]
      if (value && /^[a-zA-Z0-9_.-]+$/.test(value))
        parameters.set(key, value)
    }
    const suffix = parameters.size ? `?${parameters}` : ""
    const upstreamPath = `${session.prefix}${resource}${suffix}`
    const response = await sourceRequest({
      context,
      headers,
      path: upstreamPath,
      timeoutMilliseconds: REQUEST_TIMEOUT_MILLISECONDS,
    })
    if (!resource.endsWith(".m3u8")) return response

    const upstreamUrl = sourceUrl({
      baseUrl: context.source.settings.url,
      path: upstreamPath,
    })
    const rewrite = (uri: string) => {
      const resolved = new URL(uri, upstreamUrl)
      if (
        resolved.origin !== new URL(upstreamUrl).origin ||
        !resolved.pathname.startsWith(session.prefix) ||
        resolved.search
      )
        throw new Error(
          "Home Assistant playlist referenced another resource.",
        )
      const child = resolved.pathname.slice(
        session.prefix.length,
      )
      return `?kind=hls&session=${encodeURIComponent(sessionId)}&resource=${encodeURIComponent(child)}`
    }
    const playlist = (await response.text())
      .split("\n")
      .map((line) => {
        if (line.startsWith("#"))
          return line.replace(
            /URI="([^"]+)"/g,
            (_, uri: string) => `URI="${rewrite(uri)}"`,
          )
        return line.trim() ? rewrite(line.trim()) : line
      })
      .join("\n")
    return new Response(playlist, {
      headers: {
        "content-type": "application/vnd.apple.mpegurl",
      },
    })
  }
  return { fetchResource, dispose: () => sessions.clear() }
}
