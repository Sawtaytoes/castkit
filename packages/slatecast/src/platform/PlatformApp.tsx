import type { ContractData } from "@castkit/sdk/contracts"
import { selectPanelData } from "@castkit/sdk/panelSelection"
import { getEffectiveRepaint } from "@castkit/shared/panels/repaint"
import type { JSX } from "preact"
import { useEffect, useState } from "preact/hooks"
import { viewAppearance } from "./appearance.ts"
import { CompositionDeck } from "./CompositionDeck.tsx"
import {
  CompositionNavigation,
  useCompositionTransition,
} from "./CompositionNavigation.ts"
import { DeferredHomeDashboard } from "./DeferredHomeDashboard.tsx"
import { DisplayContext } from "./DisplayContext.ts"
import {
  type DisplayProperties,
  DisplayPropertiesContext,
} from "./displayProperties.ts"
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
import "./idleDashboard.css"
import { DisplayLoading } from "./DisplayLoading.tsx"
import { ViewTabs } from "./ViewTabs.tsx"
import { ViewTransition } from "./ViewTransition.tsx"

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
          snapshot.panelActivity?.[panel.id] !== false ||
          (panel.specId === "kids-points" &&
            panel.settings.isPersistentSummary === true) ||
          (panel.specId === "music-player" &&
            panel.settings.presentation === "compact" &&
            Boolean(
              (
                snapshot.channels[panel.bindings.data ?? ""]
                  ?.data as
                  | ContractData["music-player.v1"]
                  | undefined
              )?.current,
            )),
      )
    : snapshot.view.panels
  const isCombined = ["cards", "rail", "adaptive"].includes(
    snapshot.view.layout,
  )
  const hasBusyWork = panels.some((panel) => {
    const data = selectPanelData({
      ...panel,
      data: snapshot.channels[panel.bindings.data ?? ""]
        ?.data,
    })
    if (panel.specId === "printer-status") {
      return Boolean(
        (data as ContractData["printers.v1"] | undefined)
          ?.printers.length,
      )
    }
    if (panel.specId === "rip-deck") {
      const rips = data as
        | ContractData["rip-deck.v1"]
        | undefined
      return Boolean(
        rips?.isPresent &&
          (rips.activeCount > 0 ||
            rips.bays.some(
              (bay) => bay.jobId !== undefined,
            )),
      )
    }
    return false
  })
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
                ...(panel.specId === "kids-points" &&
                panel.settings.isPersistentSummary === true
                  ? {
                      isCompactSummary: hasBusyWork,
                      isAllChildrenVisible: true,
                    }
                  : {}),
              },
            }
          : panel,
        data,
      },
    ]
  })
  const [focusedKey, setFocusedKey] = useState<string>()
  const [navigationRevision, setNavigationRevision] =
    useState(0)
  const combined = useCompositionLayout({
    focusedKey,
    navigationRevision,
    panels: displayedPanels,
    mode: snapshot.view.layout,
    data: Object.fromEntries(
      displayedPanels.map((item) => [item.key, item.data]),
    ),
  })
  const captureNavigation = useCompositionTransition({
    element: combined.element,
    revision: combined.navigationRevision,
    isAnimated: ["instant", "fast"].includes(
      getEffectiveRepaint({
        repaint:
          snapshot.displayProperties?.repaint ?? "instant",
        power: snapshot.displayProperties?.power ?? "wired",
      }),
    ),
  })
  const hasFocusedLayout =
    focusedKey !== undefined &&
    displayedPanels.some((item) => item.key === focusedKey)
  const layout =
    isCombined || hasFocusedLayout
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
    <CompositionNavigation.Provider
      key={key}
      value={{
        isDetailFocused: focusedKey === key,
        navigate: (update, isDetailOpen) => {
          captureNavigation()
          update()
          setFocusedKey((current) =>
            isDetailOpen
              ? key
              : current === key
                ? undefined
                : current,
          )
          setNavigationRevision((revision) => revision + 1)
        },
        release: () =>
          setFocusedKey((current) =>
            current === key ? undefined : current,
          ),
      }}
    >
      <Panel
        compositionKey={key}
        layoutStyle={
          isCombined || hasFocusedLayout
            ? combined.layout?.cells[key]
            : undefined
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
            : hasFocusedLayout &&
                panel.specId === "ai-usage"
              ? {
                  ...panel,
                  settings: {
                    ...panel.settings,
                    isAdaptiveLayout: true,
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
    </CompositionNavigation.Provider>
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
            ...(isCombined || hasFocusedLayout
              ? combined.layout?.style
              : {}),
          }}
          data-layout={layout}
          data-navigation-focus={
            hasFocusedLayout ? focusedKey : undefined
          }
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
  isDeviceShell = false,
  isTargetPending = false,
  deviceProperties,
}: {
  deviceProperties?: DisplayProperties
  target: DisplayTarget
  isDeviceShell?: boolean
  isTargetPending?: boolean
}) => {
  const display = useDisplay(target, isDeviceShell)
  const isReady = useRenderReadiness(display.snapshot)
  const properties =
    display.snapshot?.displayProperties ?? deviceProperties
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
    document.documentElement.dataset.contrast =
      properties?.contrast ?? "standard"
    document.documentElement.dataset.repaint =
      properties?.repaint ?? "instant"
    apply()
    preference.addEventListener("change", apply)
    return () =>
      preference.removeEventListener("change", apply)
  }, [
    display.snapshot?.view.theme,
    properties?.repaint,
    properties?.contrast,
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
    return <DisplayLoading error={display.error} />
  }
  const availableViews =
    display.snapshot.availableViews ?? []
  const hasScreenNavigation =
    !display.isPreview &&
    target.kind === "screen" &&
    availableViews.length > 0 &&
    (!(target.deviceId || deviceProperties) ||
      properties?.hasViewDrawer === true)
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
      data-device={String(
        Boolean(target.deviceId || deviceProperties),
      )}
      data-screen-navigation={String(hasScreenNavigation)}
      // The view on screen now. A screen switches views without changing its
      // URL, so the desktop app reads this to keep a zoom per view.
      data-view={display.snapshot.view.id}
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
      {display.error ? (
        <p class="platform-notice" role="alert">
          {display.error}
        </p>
      ) : null}
      <ViewTransition
        revision={display.snapshot.view.id}
        properties={properties}
        isPending={
          display.isLoadingTarget || isTargetPending
        }
      >
        {isDeviceShell ? (
          <CompositionDeck
            snapshot={display.snapshot}
            target={target}
            renderComposition={({
              snapshot,
              isVisible,
            }) => (
              <DisplayComposition
                snapshot={{
                  ...snapshot,
                  displayProperties:
                    snapshot.displayProperties ??
                    deviceProperties,
                }}
                isConnected={
                  isVisible && display.isConnected
                }
                isPending={
                  !isVisible ||
                  display.isPending ||
                  isTargetPending
                }
                onAction={display.requestAction}
              />
            )}
          />
        ) : (
          <DisplayComposition
            key={display.snapshot.view.id}
            snapshot={{
              ...display.snapshot,
              displayProperties: properties,
            }}
            isConnected={display.isConnected}
            isPending={display.isPending || isTargetPending}
            controlDisabledReason={
              display.isPreview
                ? "Preview · Controls disabled"
                : undefined
            }
            onAction={display.requestAction}
          />
        )}
      </ViewTransition>
    </main>
  )
}
