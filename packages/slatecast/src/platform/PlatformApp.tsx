import type { JSX } from "preact"
import { useEffect } from "preact/hooks"
import { viewAppearance } from "./appearance.ts"
import { DisplayContext } from "./DisplayContext.ts"
import { DisplayPropertiesContext } from "./displayProperties.ts"
import { Panel } from "./Panel.tsx"
import { PinKeypad } from "./PinKeypad.tsx"
import type {
  DisplaySnapshot,
  DisplayTarget,
  PanelAction,
} from "./protocol.ts"
import { useRenderReadiness } from "./RenderReadiness.ts"
import { useDisplay } from "./useDisplay.ts"
import "./platform.css"

/** Pure composition surface shared by the live client and preview stories. */
export const DisplayComposition = ({
  snapshot,
  isConnected,
  isPending = false,
  onAction,
}: {
  snapshot: DisplaySnapshot
  isConnected: boolean
  isPending?: boolean
  onAction: (action: PanelAction) => Promise<void>
}) => (
  <DisplayPropertiesContext.Provider
    value={snapshot.displayProperties}
  >
    <DisplayContext.Provider value={snapshot.target}>
      <div
        class="platform-layout"
        style={viewAppearance(snapshot.view)}
        data-layout={snapshot.view.layout}
      >
        {snapshot.view.panels.map((panel) => (
          <Panel
            key={`${snapshot.view.id}:${panel.id}`}
            panel={panel}
            browserEntry={
              snapshot.viewSpecs?.find(
                (spec) => spec.id === panel.specId,
              )?.browserEntry
            }
            inputs={
              snapshot.viewSpecs?.find(
                (spec) => spec.id === panel.specId,
              )?.inputs
            }
            channels={snapshot.channels}
            isControlEnabled={
              snapshot.canControl &&
              isConnected &&
              !isPending
            }
            onAction={onAction}
          />
        ))}
      </div>
    </DisplayContext.Provider>
  </DisplayPropertiesContext.Provider>
)

/** Browser views and named screens share a client without registering a device. */
export const PlatformApp = ({
  target,
}: {
  target: DisplayTarget
}) => {
  const display = useDisplay(target)
  const isReady = useRenderReadiness(display.snapshot)
  useEffect(() => {
    if (
      new URLSearchParams(window.location.search).get(
        "preview",
      ) === "1" &&
      window.parent !== window
    ) {
      // Composed browser pages currently render upright; installation rotation is applied only to image delivery.
      window.parent.postMessage(
        {
          type: "castkit-preview-orientation",
          deviceId: target.deviceId,
          orientation: 0,
        },
        window.location.origin,
      )
    }
  }, [target.deviceId])
  useEffect(() => {
    const preference = window.matchMedia(
      "(prefers-color-scheme: dark)",
    )
    const apply = () => {
      document.documentElement.dataset.scheme =
        display.snapshot?.view.theme === "auto"
          ? preference.matches
            ? "dark"
            : "light"
          : (display.snapshot?.view.theme ?? "dark")
    }
    document.documentElement.dataset.repaint =
      display.snapshot?.displayProperties?.repaint ??
      "instant"
    apply()
    preference.addEventListener("change", apply)
    return () =>
      preference.removeEventListener("change", apply)
  }, [
    display.snapshot?.view.theme,
    display.snapshot?.displayProperties?.repaint,
  ])
  if (display.isLocked) {
    return (
      <PinKeypad
        name={display.name}
        error={display.error}
        isPending={display.isPending}
        onUnlock={display.unlock}
      />
    )
  }
  if (!display.snapshot) {
    return (
      <main class="platform-lock">
        <h1>CastKit</h1>
        <p role="status">
          {display.error || "Connecting…"}
        </p>
      </main>
    )
  }
  const availableViews =
    display.snapshot.availableViews ?? []
  const hasScreenNavigation =
    target.kind === "screen" &&
    availableViews.length > 0 &&
    (!target.deviceId ||
      display.snapshot.displayProperties?.hasViewDrawer ===
        true)
  const navigate = (
    event: JSX.TargetedMouseEvent<HTMLElement>,
  ) => {
    if (
      target.kind !== "screen" ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return
    const anchor =
      event.target instanceof Element
        ? event.target.closest("a[href]")
        : null
    if (
      !(anchor instanceof HTMLAnchorElement) ||
      anchor.target === "_blank" ||
      anchor.hasAttribute("download")
    )
      return
    const url = new URL(anchor.href, window.location.href)
    if (url.origin !== window.location.origin) return
    const match = /^\/view\/([^/]+)\/?$/.exec(url.pathname)
    if (!match) return
    const selected = availableViews.find(
      (view) => encodeURIComponent(view.id) === match[1],
    )
    if (!selected) return
    event.preventDefault()
    void display.selectView(selected.id)
  }
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: This delegates native anchor clicks, including Enter activation; another keyboard handler would select twice.
    <main
      class="platform"
      style={viewAppearance(display.snapshot.view)}
      data-device={String(Boolean(target.deviceId))}
      data-screen-navigation={String(hasScreenNavigation)}
      onClick={navigate}
      data-scheme={
        display.snapshot.view.theme === "auto"
          ? undefined
          : display.snapshot.view.theme
      }
      data-castkit-ready={String(isReady)}
    >
      <header class="platform-header">
        <h1>{display.snapshot.view.name}</h1>
        <div>
          {hasScreenNavigation ? (
            <label class="platform-view-picker">
              View
              <select
                aria-label="View"
                data-castkit-target="screen:select-view"
                value={display.snapshot.view.id}
                disabled={
                  display.isPending || !display.isConnected
                }
                onChange={(event) =>
                  void display.selectView(
                    event.currentTarget.value,
                  )
                }
              >
                {availableViews.map((view) => (
                  <option key={view.id} value={view.id}>
                    {view.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {!display.isConnected ? (
            <span role="status">
              Connection lost · Retrying
            </span>
          ) : null}
          {display.snapshot.view.access === "pin" ||
          display.snapshot.screen?.access === "pin" ? (
            <button
              type="button"
              onClick={() => void display.lock()}
            >
              Lock
            </button>
          ) : null}
        </div>
      </header>
      {display.error ? (
        <p class="platform-notice" role="alert">
          {display.error}
        </p>
      ) : null}
      <DisplayComposition
        snapshot={display.snapshot}
        isConnected={display.isConnected}
        isPending={display.isPending}
        onAction={display.requestAction}
      />
    </main>
  )
}
