import type {
  ChannelDefinition,
  ViewDefinition,
} from "@castkit/sdk/contracts"
import type { DeviceViewOverrides } from "@castkit/shared/views/deviceViewOverrides"
import { resolveDeviceView } from "@castkit/shared/views/deviceViewOverrides"
import type { createPlatformCatalog } from "./platformCatalog.ts"

/** Validate customizations against the candidate shared views, channels, and extension catalog before persistence. */
export const validateDeviceViewOverrides = ({
  definitions,
  views,
  channels,
  catalog,
}: {
  definitions: readonly {
    id: string
    viewOverrides?: DeviceViewOverrides
  }[]
  views: ViewDefinition[]
  channels: ChannelDefinition[]
  catalog: Pick<
    ReturnType<typeof createPlatformCatalog>,
    "getViewSpec" | "validateView"
  >
}) => {
  definitions.forEach((device) => {
    Object.entries(device.viewOverrides ?? {}).forEach(
      ([viewId, override]) => {
        const view = views.find(
          (candidate) => candidate.id === viewId,
        )
        if (!view)
          throw new Error(
            `Device ${device.id} customizes an unknown view: ${viewId}`,
          )
        Object.entries(override.panels).forEach(
          ([panelId, changes]) => {
            const panel = view.panels.find(
              (candidate) => candidate.id === panelId,
            )
            if (!panel)
              throw new Error(
                `Device ${device.id} customizes an unknown panel: ${panelId}`,
              )
            const spec = catalog.getViewSpec(panel.specId)
            Object.keys(changes.bindings ?? {}).forEach(
              (key) => {
                if (
                  !spec?.inputs.some(
                    (input) => input.key === key,
                  )
                )
                  throw new Error(
                    `Unknown device view input: ${key}`,
                  )
              },
            )
            const fields = new Set([
              ...Object.keys(panel.settings),
              ...(spec?.settings.flatMap((field) => [
                field.key,
                field.key.replace(/Json$/, ""),
              ]) ?? []),
            ])
            Object.keys(changes.settings ?? {}).forEach(
              (key) => {
                if (!fields.has(key))
                  throw new Error(
                    `Unknown device view setting: ${key}`,
                  )
              },
            )
          },
        )
        catalog.validateView(
          resolveDeviceView({
            view,
            overrides: device.viewOverrides,
          }),
          channels,
        )
      },
    )
  })
}
