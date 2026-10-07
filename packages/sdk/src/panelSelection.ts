import { selectPrimaryWindow } from "./aiUsageWindow.ts"
import type {
  ContractData,
  ViewPanel,
} from "./contracts.ts"
import { isRipBayActive } from "./ripActivity.ts"

const includesItem = ({
  settings,
  enabledKey,
  selectionKey,
  id,
}: {
  settings: Record<string, unknown>
  enabledKey: string
  selectionKey: string
  id: string
}) =>
  settings[enabledKey] !== true ||
  (Array.isArray(settings[selectionKey]) &&
    settings[selectionKey].includes(id))

const selectQuota = (
  windows: ContractData["ai-usage.v1"]["providers"][number]["windows"],
  settings: Record<string, unknown>,
) => {
  if (settings.isAlertReplacementEnabled !== true) {
    return windows
  }
  const primary = selectPrimaryWindow(windows)
  const threshold = Number(settings.alertPercent ?? 80)
  const alertPercent =
    Number.isFinite(threshold) &&
    threshold >= 0 &&
    threshold <= 100
      ? threshold
      : 80
  const urgent = windows
    .filter(
      (window) =>
        window !== primary &&
        window.percentUsed !== undefined &&
        window.percentUsed > alertPercent &&
        (window.periodHours ?? Infinity) <
          (primary?.periodHours ?? Infinity),
    )
    .reduce<(typeof windows)[number] | undefined>(
      (highest, window) =>
        (window.percentUsed ?? 0) >
        (highest?.percentUsed ?? -1)
          ? window
          : highest,
      undefined,
    )
  const selected = urgent ?? primary
  return selected ? [selected] : []
}

/** Apply a component's saved item selection without changing its shared source channel. */
export const selectPanelData = ({
  specId,
  settings,
  data,
}: Pick<ViewPanel, "specId" | "settings"> & {
  data: unknown
}) => {
  if (data === null || data === undefined) {
    return data
  }
  if (specId === "printer-status") {
    const printers = data as ContractData["printers.v1"]
    return {
      ...printers,
      printers: printers.printers.filter((printer) =>
        includesItem({
          settings,
          enabledKey: "isPrinterSelectionEnabled",
          selectionKey: "printerIds",
          id: printer.id,
        }),
      ),
    }
  }
  if (specId === "rip-deck") {
    const rips = data as ContractData["rip-deck.v1"]
    const bays = rips.bays.filter((bay) =>
      includesItem({
        settings,
        enabledKey: "isBaySelectionEnabled",
        selectionKey: "bayIds",
        id: bay.id,
      }),
    )
    return {
      ...rips,
      bays,
      activeCount:
        settings.isBaySelectionEnabled === true
          ? bays.filter(isRipBayActive).length
          : rips.activeCount,
    }
  }
  if (specId === "ai-usage") {
    const usage = data as ContractData["ai-usage.v1"]
    return {
      ...usage,
      providers: usage.providers
        .filter((provider) =>
          includesItem({
            settings,
            enabledKey: "isProviderSelectionEnabled",
            selectionKey: "providerIds",
            id: provider.id,
          }),
        )
        .map((provider) => ({
          ...provider,
          windows: selectQuota(
            provider.windows.filter((window) =>
              includesItem({
                settings,
                enabledKey: "isWindowSelectionEnabled",
                selectionKey: "windowIds",
                id: `${provider.id}:${window.id}`,
              }),
            ),
            settings,
          ).filter(
            (window) =>
              settings.isPositiveUsageOnly !== true ||
              (window.percentUsed ?? 0) > 0,
          ),
        }))
        .filter(
          (provider) =>
            settings.isPositiveUsageOnly !== true ||
            provider.windows.length > 0,
        ),
    }
  }
  return data
}
