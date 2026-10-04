import type { ContractData } from "@castkit/sdk/contracts"
import { selectPanelData } from "@castkit/sdk/panelSelection"
import type { JSX } from "preact"
import { useEffect } from "preact/hooks"
import { viewAppearance } from "./appearance.ts"
import { DeferredHomeDashboard } from "./DeferredHomeDashboard.tsx"
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
import { useCompositionLayout } from "./useCompositionLayout.ts"
import { useDisplay } from "./useDisplay.ts"
import "./platform.css"
import { ViewTabs } from "./ViewTabs.tsx"

/** Pure composition surface shared by the live client and preview stories. */
export const DisplayComposition = ({
  snapshot,
  isConnected,
  isPending = false,
  controlDisabledReason,
  onAction,
}: {
  snapshot: DisplaySnapshot
  isConnected: boolean
  isPending?: boolean
  controlDisabledReason?: string
  onAction: (action: PanelAction) => Promise<void>
}) => {
  // An active-only view draws only the panels the server says have something
  // going on; a region with nothing to report gets out of the way and the
  // others take the room. A panel the server did not answer for is drawn.
  const panels = snapshot.view.isActiveOnly
    ? snapshot.view.panels.filter(
        (panel) =>
          snapshot.panelActivity?.[panel.id] !== false,
      )
    : snapshot.view.panels
  const isCombined = ["cards", "rail", "adaptive"].includes(
    snapshot.view.layout,
  )
  const displayedPanels = panels.flatMap((panel) => {
    const data = selectPanelData({
      ...panel,
      data: snapshot.channels[panel.bindings.data ?? ""]
        ?.data,
    })
    if (
      isCombined &&
      panel.specId === "printer-status" &&
      data
    ) {
      return (
        data as ContractData["printers.v1"]
      ).printers.map((printer, index) => ({
        key: `${snapshot.view.id}:${panel.id}:${printer.id}`,
        panel: {
          ...panel,
          settings: {
            ...panel.settings,
            title: "",
            isCompactFacts:
              panel.settings.isCompactFacts ?? true,
            isPrinterSelectionEnabled: true,
            printerIds: [printer.id],
            printerIndex: index,
          },
        },
        data: {
          ...(data as ContractData["printers.v1"]),
          printers: [printer],
        },
      }))
    }
    return [
      {
        key: `${snapshot.view.id}:${panel.id}`,
        panel: isCombined
          ? {
              ...panel,
              settings: {
                ...panel.settings,
                isAdaptiveLayout: true,
              },
            }
          : panel,
        data,
      },
    ]
  })
  const combined = useCompositionLayout({
    panels: displayedPanels,
    mode: snapshot.view.layout,
    data: Object.fromEntries(
      displayedPanels.map((item) => [item.key, item.data]),
    ),
  })
  const layout = isCombined
    ? (combined.layout?.id ?? "cards")
    : snapshot.view.isActiveOnly && panels.length <= 1
      ? "single"
      : snapshot.view.layout
  const isHome = panels.some(
    (panel) => typeof panel.settings.homeGroup === "string",
  )
  const renderPanel = ({
    key,
    panel,
  }: (typeof displayedPanels)[number]) => (
    <Panel
      key={key}
      layoutStyle={
        isCombined ? combined.layout?.cells[key] : undefined
      }
      panel={
        isCombined && panel.specId === "printer-status"
          ? {
              ...panel,
              settings: {
                ...panel.settings,
                minimumDetailLevel:
                  combined.layout?.detailLevel ?? 0,
              },
            }
          : panel
      }
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
        snapshot.canControl && isConnected && !isPending
      }
      controlDisabledReason={
        controlDisabledReason ??
        (!isConnected
          ? "Connection lost · Controls disabled"
          : isPending
            ? "Please wait · Action in progress"
            : !snapshot.view.isControlEnabled
              ? "Controls disabled for this view"
              : !snapshot.canControl
                ? "Sign in to control"
                : undefined)
      }
      onAction={onAction}
    />
  )
  return (
    <DisplayPropertiesContext.Provider
      value={snapshot.displayProperties}
    >
      <DisplayContext.Provider value={snapshot.target}>
        <div
          class="platform-layout"
          ref={combined.element}
          style={{
            ...viewAppearance(snapshot.view),
            ...(isCombined ? combined.layout?.style : {}),
          }}
          data-layout={layout}
          data-home-dashboard={String(isHome)}
          data-priority-layout={String(isCombined)}
        >
          {snapshot.view.isActiveOnly &&
          panels.length === 0 ? (
            <section
              class="platform-panel platform-nothing-active"
              aria-label="Nothing active"
            >
              <p role="status">Nothing active</p>
            </section>
          ) : null}
          {isHome ? (
            <DeferredHomeDashboard
              panels={displayedPanels}
              renderPanel={renderPanel}
            />
          ) : (
            displayedPanels.map(renderPanel)
          )}
        </div>
      </DisplayContext.Provider>
    </DisplayPropertiesContext.Provider>
  )
}

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
      <main
        class="platform-lock"
        data-connection={display.connectionStatus}
      >
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
    !display.isPreview &&
    target.kind === "screen" &&
    availableViews.length > 0 &&
    (!target.deviceId ||
      display.snapshot.displayProperties?.hasViewDrawer ===
        true)
  const navigate = (
    event: JSX.TargetedMouseEvent<HTMLElement>,
  ) => {
    if (display.isPreview) {
      if (
        event.target instanceof Element &&
        event.target.closest("a[href]")
      ) {
        event.preventDefault()
      }
      return
    }
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
      data-connection={display.connectionStatus}
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
      {hasScreenNavigation ? (
        <header class="platform-header">
          <ViewTabs
            views={availableViews}
            activeId={display.snapshot.view.id}
            isDisabled={
              display.isPending || !display.isConnected
            }
          />
        </header>
      ) : null}
      <span
        class="platform-connection-status"
        role="status"
      >
        {display.connectionStatus === "disconnected"
          ? "Connection unavailable · Retrying"
          : display.connectionStatus === "reconnecting"
            ? "Connection lost · Retrying"
            : display.connectionStatus === "connecting"
              ? "Connecting…"
              : "Connected"}
      </span>
      {display.error && display.isConnected ? (
        <p class="platform-notice" role="alert">
          {display.error}
        </p>
      ) : null}
      <DisplayComposition
        snapshot={display.snapshot}
        isConnected={display.isConnected}
        isPending={display.isPending}
        controlDisabledReason={
          display.isPreview
            ? "Preview · Controls disabled"
            : undefined
        }
        onAction={display.requestAction}
      />
    </main>
  )
}
