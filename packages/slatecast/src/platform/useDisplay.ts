import { useEffect, useRef, useState } from "preact/hooks"
import type {
  DisplaySnapshot,
  DisplayTarget,
  PanelAction,
} from "./protocol.ts"

/** Own one subscription per page, with bounded reconnect and server-issued unlock sessions. */
export const useDisplay = (target: DisplayTarget) => {
  const [snapshot, setSnapshot] =
    useState<DisplaySnapshot | null>(null)
  const [isLocked, setIsLocked] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState("")
  const [name, setName] = useState("Private view")
  const [revision, setRevision] = useState(0)
  const [isPending, setIsPending] = useState(false)
  const actionPending = useRef(false)
  const deviceQuery = target.deviceId
    ? `?device=${encodeURIComponent(target.deviceId)}`
    : ""
  const path = `/api/display/${target.kind}/${encodeURIComponent(target.id)}`
  const lockState = () => {
    setSnapshot(null)
    setIsLocked(true)
    setIsConnected(false)
  }
  useEffect(() => {
    const lifecycle: {
      isDisposed: boolean
      timer?: number
      socket?: WebSocket
      failures: number
      buildId?: string
    } = { isDisposed: false, failures: 0 }
    const controller = new AbortController()
    const isCapture =
      new URLSearchParams(window.location.search).get(
        "capture",
      ) === "1"
    const accept = (value: DisplaySnapshot) => {
      if (lifecycle.isDisposed) {
        return
      }
      if (
        lifecycle.buildId &&
        value.buildId &&
        lifecycle.buildId !== value.buildId
      ) {
        window.location.reload()
        return
      }
      lifecycle.buildId = value.buildId
      setSnapshot(value)
      setIsLocked(false)
      setError("")
      setName(value.view.name)
    }
    const reconnect = () => {
      if (lifecycle.isDisposed) {
        return
      }
      setIsConnected(false)
      lifecycle.failures += 1
      lifecycle.timer = window.setTimeout(
        () => void load(),
        Math.min(
          30_000,
          1000 * 2 ** Math.min(lifecycle.failures, 5),
        ),
      )
    }
    const load = async () => {
      try {
        const response = await fetch(
          `${path}${deviceQuery}`,
          {
            credentials: "same-origin",
            cache: "no-store",
            signal: controller.signal,
          },
        )
        if (lifecycle.isDisposed) {
          return
        }
        if (response.status === 409) {
          window.location.reload()
          return
        }
        if (
          response.status === 401 ||
          response.status === 403
        ) {
          lockState()
          const body = await response
            .json()
            .catch(() => ({}))
          setName(body.name ?? "Private view")
          return
        }
        if (!response.ok) {
          throw new Error(
            response.status === 404
              ? "This view is unavailable."
              : "CastKit could not load this view.",
          )
        }
        const value = await response.json()
        if (lifecycle.isDisposed) {
          return
        }
        accept(value)
        if (isCapture) {
          setIsConnected(true)
          return
        }
        const socket = new WebSocket(
          `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/${target.kind}/${encodeURIComponent(target.id)}/ws${deviceQuery}`,
        )
        lifecycle.socket = socket
        socket.onopen = () => {
          lifecycle.failures = 0
          setIsConnected(true)
        }
        socket.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data)
            if (message.type === "reload") {
              window.location.reload()
              return
            }
            if (message.type === "locked") {
              lockState()
              socket.close()
              return
            }
            if (message.type === "snapshot") {
              accept(message.snapshot ?? message)
            }
          } catch {
            setError("CastKit received an invalid update.")
          }
        }
        socket.onerror = () => socket.close()
        socket.onclose = (event) => {
          if (event.code === 4401 || event.code === 4403) {
            lockState()
            void load()
            return
          }
          reconnect()
        }
      } catch (failure) {
        if (lifecycle.isDisposed) {
          return
        }
        setError(
          failure instanceof Error
            ? failure.message
            : "Connection unavailable.",
        )
        reconnect()
      }
    }
    void load()
    return () => {
      lifecycle.isDisposed = true
      controller.abort()
      clearTimeout(lifecycle.timer)
      lifecycle.socket?.close()
    }
  }, [
    path,
    target.kind,
    target.id,
    target.deviceId,
    revision,
  ])
  const unlock = async (pin: string) => {
    setIsPending(true)
    setError("")
    try {
      const response = await fetch("/api/access/unlock", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...target, pin }),
      })
      if (!response.ok) {
        throw new Error(
          response.status === 429
            ? "Wait before trying the PIN again."
            : "The PIN was not accepted.",
        )
      }
      setRevision((current) => current + 1)
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unlock failed.",
      )
    } finally {
      setIsPending(false)
    }
  }
  const lock = async () => {
    try {
      const response = await fetch("/api/access/lock", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(target),
      })
      if (!response.ok) {
        throw new Error("Could not lock this display.")
      }
      lockState()
      setRevision((current) => current + 1)
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Lock failed.",
      )
    }
  }
  const requestAction = async (action: PanelAction) => {
    if (
      !snapshot?.canControl ||
      !isConnected ||
      actionPending.current
    ) {
      return
    }
    actionPending.current = true
    setIsPending(true)
    setError("")
    try {
      const response = await fetch(
        `${path}/actions${deviceQuery}`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(action),
        },
      )
      if (response.status === 401) {
        lockState()
      }
      if (!response.ok) {
        throw new Error(
          "The action was not accepted. Check the source connection.",
        )
      }
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Action failed.",
      )
    } finally {
      actionPending.current = false
      setIsPending(false)
    }
  }
  return {
    snapshot,
    isLocked,
    isConnected,
    isPending,
    error,
    name,
    unlock,
    lock,
    requestAction,
  }
}
