import type {
  ChannelSnapshot,
  ViewPanel,
} from "@castkit/sdk/contracts"
import type {
  BrowserRenderer,
  ViewHost,
} from "@castkit/sdk/subscription"
import {
  useContext,
  useEffect,
  useRef,
  useState,
} from "preact/hooks"
import { DisplayContext } from "./DisplayContext.ts"
import type { PanelAction } from "./protocol.ts"

/** Mount trusted extension assets through the framework-independent SDK host. */
export const PluginView = ({
  entry,
  panel,
  channels,
  isControlEnabled,
  onAction,
  loadRenderer = (modulePath) =>
    import(/* @vite-ignore */ modulePath),
}: {
  entry: string
  loadRenderer?: (
    modulePath: string,
  ) => Promise<BrowserRenderer>
  panel: ViewPanel
  channels: Record<string, ChannelSnapshot>
  isControlEnabled: boolean
  onAction: (action: PanelAction) => Promise<void>
}) => {
  const target = useContext(DisplayContext)
  const element = useRef<HTMLDivElement>(null)
  const renderer = useRef<ReturnType<
    BrowserRenderer["mount"]
  > | null>(null)
  const listeners = useRef(new Set<() => void>())
  const [error, setError] = useState("")
  const [isMounted, setIsMounted] = useState(false)
  const [retryToken, setRetryToken] = useState("")
  const current = useRef({
    channels,
    panel,
    isControlEnabled,
    onAction,
  })
  current.current = {
    channels,
    panel,
    isControlEnabled,
    onAction,
  }
  const host: ViewHost = {
    getChannel: (input) =>
      current.current.channels[
        current.current.panel.bindings[input] ?? ""
      ],
    subscribe: (listener) => {
      listeners.current.add(listener)
      return () => {
        listeners.current.delete(listener)
      }
    },
    executeAction: async ({ input, action, payload }) => {
      if (!current.current.isControlEnabled) {
        throw new Error("Controls are unavailable.")
      }
      return current.current.onAction({
        panelId: current.current.panel.id,
        action,
        input,
        payload,
      })
    },
    get theme() {
      const styles = getComputedStyle(
        element.current ?? document.documentElement,
      )
      return {
        background: styles.getPropertyValue("--bg"),
        foreground: styles.getPropertyValue("--fg"),
        accent: styles.getPropertyValue("--accent"),
        muted: styles.getPropertyValue("--fg-dim"),
        fontFamily: styles.getPropertyValue("--font-sans"),
      }
    },
    get settings() {
      return current.current.panel.settings
    },
    get isControlEnabled() {
      return current.current.isControlEnabled
    },
    mediaUrl: ({ input, assetId, kind }) => {
      const channel =
        current.current.channels[
          current.current.panel.bindings[input] ?? ""
        ]
      if (!channel) {
        return ""
      }
      const serialized = JSON.stringify(channel.data)
      if (
        assetId.startsWith("/api/") &&
        serialized.includes(JSON.stringify(assetId))
      ) {
        return assetId
      }
      if (!target || assetId.startsWith("/")) {
        return ""
      }
      return `/api/display/${target.kind}/${encodeURIComponent(target.id)}/media/${encodeURIComponent(channel.id)}/${encodeURIComponent(assetId)}${kind ? `?kind=${encodeURIComponent(kind)}` : ""}`
    },
  }
  const latestHost = useRef(host)
  latestHost.current = host
  useEffect(() => {
    const lifecycle = { isDisposed: false }
    const container = element.current
    setError("")
    setIsMounted(false)
    if (
      !/^\/(?:assets\/plugins|api\/plugins\/assets)\/[a-zA-Z0-9_][a-zA-Z0-9_.-]*\/(?:[a-zA-Z0-9_][a-zA-Z0-9_.-]*\/)*[a-zA-Z0-9_][a-zA-Z0-9_.-]*\.m?js$/.test(
        entry,
      ) ||
      entry.includes("..")
    ) {
      setError("The plugin has no valid browser asset.")
      return
    }
    // Native imports cache failed loads too. A deliberate retry needs a fresh URL;
    // successful versions retain their immutable installation URL across snapshots.
    void loadRenderer(
      retryToken ? `${entry}?retry=${retryToken}` : entry,
    )
      .then((module: BrowserRenderer) => {
        if (lifecycle.isDisposed || !element.current) {
          return
        }
        if (typeof module.mount !== "function") {
          throw new Error(
            "The plugin does not export a mount function.",
          )
        }
        renderer.current = module.mount(
          element.current,
          latestHost.current,
        )
        setIsMounted(true)
      })
      .catch((failure: unknown) => {
        if (!lifecycle.isDisposed) {
          setError(
            failure instanceof Error
              ? failure.message
              : "Could not load this view plugin.",
          )
        }
      })
    return () => {
      lifecycle.isDisposed = true
      try {
        renderer.current?.destroy()
      } catch {
        /* A plugin cleanup cannot prevent the host from releasing the panel. */
      }
      renderer.current = null
      listeners.current.clear()
      container?.replaceChildren()
    }
  }, [entry, panel.id, retryToken])
  useEffect(() => {
    try {
      renderer.current?.update(host)
      listeners.current.forEach((listener) => {
        listener()
      })
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "This view plugin could not update.",
      )
    }
  }, [
    channels,
    panel.bindings,
    panel.settings,
    isControlEnabled,
  ])
  return (
    <div
      class="platform-plugin"
      data-castkit-plugin-ready={String(
        isMounted || Boolean(error),
      )}
    >
      {error ? (
        <div>
          <p role="alert">{error}</p>
          <button
            type="button"
            onClick={() =>
              setRetryToken(String(Date.now()))
            }
          >
            Retry view
          </button>
        </div>
      ) : null}
      <div ref={element} />
    </div>
  )
}
