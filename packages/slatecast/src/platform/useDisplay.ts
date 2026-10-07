import {
  type ConnectionStatus,
  connectionTransitions,
  createStatus,
} from "@charcuterie/logic/core"
import { useEffect, useRef, useState } from "preact/hooks"
import { reloadPage } from "../reloadPage.ts"
import type {
  DisplaySnapshot,
  DisplayTarget,
  PanelAction,
} from "./protocol.ts"

/** Own one subscription per page, with bounded reconnect and server-issued unlock sessions. */
export const useDisplay = (target: DisplayTarget) => {
  const isPreview =
    new URLSearchParams(window.location.search).get(
      "preview",
    ) === "1"
  const [snapshot, setSnapshot] =
    useState<DisplaySnapshot | null>(null)
  const [isLocked, setIsLocked] = useState(false)
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("connecting")
  const isConnected = connectionStatus === "connected"
  const [error, setError] = useState("")
  const [name, setName] = useState("Private view")
  const [revision, setRevision] = useState(0)
  const [isPending, setIsPending] = useState(false)
  const actionPending = useRef(false)
  const authChannel = useRef<BroadcastChannel | null>(null)
  useEffect(() => {
    if (isPreview) {
      return
    }
    const refresh = () =>
      setRevision((current) => current + 1)
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        refresh()
      }
    }
    const channel = new BroadcastChannel("castkit-access")
    authChannel.current = channel
    channel.onmessage = refresh
    window.addEventListener("focus", refresh)
    document.addEventListener(
      "visibilitychange",
      onVisibility,
    )
    return () => {
      channel.close()
      window.removeEventListener("focus", refresh)
      document.removeEventListener(
        "visibilitychange",
        onVisibility,
      )
    }
  }, [isPreview])
  const deviceQuery = target.deviceId
    ? `?device=${encodeURIComponent(target.deviceId)}`
    : ""
  const path = `/api/display/${target.kind}/${encodeURIComponent(target.id)}`
  const lockState = () => {
    setSnapshot(null)
    setIsLocked(true)
    setConnectionStatus("disconnected")
  }
  useEffect(() => {
    const lifecycle: {
      isDisposed: boolean
      timer?: number
      outageTimer?: number
      socket?: WebSocket
      failures: number
      buildId?: string
    } = { isDisposed: false, failures: 0 }
    const connection = createStatus<ConnectionStatus>({
      initialState: "connecting",
      transitions: connectionTransitions,
      onChange: setConnectionStatus,
    })
    const connected = () => {
      clearTimeout(lifecycle.outageTimer)
      lifecycle.outageTimer = undefined
      if (connection.is("disconnected")) {
        connection.transitionTo("connecting")
      }
      if (connection.can("connected")) {
        connection.transitionTo("connected")
      }
      lifecycle.failures = 0
    }
    const unavailable = () => {
      if (connection.can("disconnected")) {
        connection.transitionTo("disconnected")
      }
    }
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
        reloadPage()
        return
      }
      lifecycle.buildId = value.buildId
      setSnapshot(
        isPreview ? { ...value, canControl: false } : value,
      )
      setIsLocked(false)
      setError("")
      setName(value.view.name)
    }
    const reconnect = () => {
      if (lifecycle.isDisposed) {
        return
      }
      if (connection.is("connected")) {
        connection.transitionTo("reconnecting")
      } else if (connection.is("connecting")) {
        unavailable()
      }
      if (lifecycle.outageTimer === undefined) {
        lifecycle.outageTimer = window.setTimeout(
          unavailable,
          30_000,
        )
      }
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
          reloadPage()
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
          if (response.status === 404) unavailable()
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
          connected()
          return
        }
        const socket = new WebSocket(
          `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/${target.kind}/${encodeURIComponent(target.id)}/ws${deviceQuery}`,
        )
        lifecycle.socket = socket
        socket.onopen = () => {
          connected()
        }
        socket.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data)
            if (message.type === "reload") {
              reloadPage()
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
      clearTimeout(lifecycle.outageTimer)
      lifecycle.socket?.close()
    }
  }, [
    path,
    target.kind,
    target.id,
    target.deviceId,
    revision,
    isPreview,
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
      authChannel.current?.postMessage("changed")
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
  const selectView = async (viewId: string) => {
    if (
      target.kind !== "screen" ||
      isPreview ||
      !isConnected ||
      actionPending.current ||
      !snapshot?.availableViews?.some(
        (view) => view.id === viewId,
      )
    )
      return
    actionPending.current = true
    setIsPending(true)
    setError("")
    try {
      const response = await fetch(
        `${path}/select${deviceQuery}`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ viewId }),
        },
      )
      if (response.status === 409 && target.deviceId) {
        reloadPage()
        return
      }
      if (response.status === 401) lockState()
      if (!response.ok)
        throw new Error(
          "Could not change this screen's view.",
        )
      const body = await response.json()
      const next: DisplaySnapshot = body.snapshot ?? body
      setSnapshot(next)
      setName(next.view.name)
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not change this screen's view.",
      )
    } finally {
      actionPending.current = false
      setIsPending(false)
    }
  }
  const requestAction = async (action: PanelAction) => {
    if (
      !snapshot?.canControl ||
      isPreview ||
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
    isPreview,
    snapshot,
    isLocked,
    isConnected,
    connectionStatus,
    isPending,
    error,
    name,
    unlock,
    requestAction,
    selectView,
  }
}
