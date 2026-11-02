import type { ViewDefinition } from "@castkit/sdk/contracts"

/** A device may change existing panel inputs and settings while inheriting the composition and access policy. */
export type DeviceViewOverride = {
  name?: string
  panels: Record<
    string,
    {
      bindings?: Record<string, string>
      settings?: Record<string, unknown>
    }
  >
}

/** Saved view IDs identify optional installation-specific customizations. */
export type DeviceViewOverrides = Record<
  string,
  DeviceViewOverride
>

/** Resolve one installation without changing the saved shared view. An empty input removes an optional binding. */
export const resolveDeviceView = ({
  view,
  overrides,
}: {
  view: ViewDefinition
  overrides?: DeviceViewOverrides
}) => {
  const override =
    overrides && Object.hasOwn(overrides, view.id)
      ? overrides[view.id]
      : undefined
  if (!override) return view
  return {
    ...view,
    name: override.name ?? view.name,
    panels: view.panels.map((panel) => {
      const changes = Object.hasOwn(
        override.panels,
        panel.id,
      )
        ? override.panels[panel.id]
        : undefined
      return changes
        ? {
            ...panel,
            bindings: Object.fromEntries(
              Object.entries({
                ...panel.bindings,
                ...changes.bindings,
              }).filter(
                ([, channelId]) => channelId !== "",
              ),
            ),
            settings: {
              ...panel.settings,
              ...changes.settings,
            },
          }
        : panel
    }),
  }
}
