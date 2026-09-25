import { isVisible } from "@castkit/sdk/conditions"
import type {
  ChannelSnapshot,
  ContractData,
  ViewPanel,
} from "@castkit/sdk/contracts"
import type { ViewInput } from "@castkit/sdk/plugin"
import { BuiltinView } from "./BuiltinView.tsx"
import { useDisplayProperties } from "./displayProperties.ts"
import { PluginView } from "./PluginView.tsx"
import { PrintersView } from "./PrintersView.tsx"
import type { PanelAction } from "./protocol.ts"
import { RipDeckView } from "./RipDeckView.tsx"

/** Resolve each panel's own bindings; no shared mutable view data crosses panels. */
export const Panel = ({
  panel,
  channels,
  isControlEnabled,
  onAction,
  browserEntry,
  inputs,
}: {
  panel: ViewPanel
  channels: Record<string, ChannelSnapshot>
  isControlEnabled: boolean
  browserEntry?: string
  inputs?: ViewInput[]
  onAction: (action: PanelAction) => Promise<void>
}) => {
  const properties = useDisplayProperties()
  const source =
    channels[
      panel.bindings.data ??
        Object.values(panel.bindings)[0] ??
        ""
    ]
  const title =
    typeof panel.settings.title === "string"
      ? panel.settings.title
      : panel.specId.replaceAll("-", " ")
  const requestAction = (
    action: string,
    payload?: Record<string, unknown>,
  ) => onAction({ panelId: panel.id, action, payload })
  const boundEntities = Object.values(
    panel.bindings,
  ).flatMap((channelId) => {
    const channel = channels[channelId]
    return channel?.type === "entities.v1" && channel.data
      ? (channel.data as ContractData["entities.v1"])
          .entities
      : []
  })
  if (
    !isVisible({
      condition:
        panel.settings.visibleWhen ??
        panel.settings.visibleWhenJson,
      entities: boundEntities,
      matchMedia: (query) =>
        window.matchMedia(query).matches,
    })
  ) {
    return null
  }
  const isClock =
    panel.specId === "clock" ||
    panel.specId === "ambient" ||
    panel.specId === "text"
  const declaredInputs =
    inputs ??
    (Object.keys(panel.bindings).length
      ? Object.keys(panel.bindings).map((key) => ({
          key,
          label: key,
          type: "",
          isRequired: true,
        }))
      : isClock || browserEntry
        ? []
        : [
            {
              key: "data",
              label: "Data",
              type: "",
              isRequired: true,
            },
          ])
  const observedInputs = declaredInputs.filter(
    (input) =>
      input.isRequired || panel.bindings[input.key],
  )
  const isSourceReady = observedInputs.every(
    (input) =>
      channels[panel.bindings[input.key] ?? ""]?.status ===
      "ready",
  )
  const isWaiting =
    !source ||
    source.data === null ||
    source.data === undefined
  return (
    <section
      class="platform-panel"
      aria-label={title}
      data-spec={panel.specId}
    >
      {typeof panel.settings.title === "string" &&
      panel.settings.title ? (
        <h2 class="platform-panel-title">
          {panel.settings.title}
        </h2>
      ) : null}
      {observedInputs
        .filter(
          (input) =>
            channels[panel.bindings[input.key] ?? ""]
              ?.status !== "ready",
        )
        .map((input) => {
          const channel =
            channels[panel.bindings[input.key] ?? ""]
          return (
            <p
              class="platform-source-status"
              role="status"
              key={input.key}
            >
              {input.label}:{" "}
              {!channel
                ? "Choose a data channel for this view."
                : channel.status === "waiting"
                  ? "Waiting for data…"
                  : channel.status === "stale"
                    ? "Data is out of date · Controls unavailable"
                    : `Source unavailable${channel.error ? `: ${channel.error}` : ""}`}
              {channel?.updatedAt ? (
                <span>
                  Last update:{" "}
                  {new Date(
                    channel.updatedAt,
                  ).toLocaleString()}
                </span>
              ) : null}
            </p>
          )
        })}
      {browserEntry ? (
        <PluginView
          entry={browserEntry}
          panel={panel}
          channels={channels}
          isControlEnabled={
            isControlEnabled &&
            properties.isInteractive &&
            isSourceReady
          }
          onAction={onAction}
        />
      ) : isClock || !isWaiting ? (
        panel.specId === "printer-status" ? (
          <PrintersView
            data={
              source?.data as ContractData["printers.v1"]
            }
            cameras={
              channels[panel.bindings.cameras ?? ""]
                ?.data as
                | ContractData["cameras.v1"]
                | undefined
            }
            isControlEnabled={
              isControlEnabled &&
              properties.isInteractive &&
              isSourceReady
            }
            onAction={requestAction}
            settings={panel.settings}
          />
        ) : panel.specId === "rip-deck" ? (
          <RipDeckView
            data={
              source?.data as ContractData["rip-deck.v1"]
            }
            isControlEnabled={
              isControlEnabled &&
              properties.isInteractive &&
              isSourceReady
            }
            onAction={requestAction}
          />
        ) : (
          <BuiltinView
            panel={panel}
            data={source?.data}
            isControlEnabled={
              isControlEnabled &&
              properties.isInteractive &&
              (isSourceReady || isClock)
            }
            onAction={requestAction}
          />
        )
      ) : null}
    </section>
  )
}
