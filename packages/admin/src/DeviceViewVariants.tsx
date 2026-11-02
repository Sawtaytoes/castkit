import type { DeviceViewOverride } from "@castkit/shared/views/deviceViewOverrides"
import {
  Accordion,
  Button,
  Card,
  Checkbox,
  Field,
  Picker,
} from "@charcuterie/ui"
import {
  Pencil,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react"
import { useState } from "react"
import type { Device } from "./device.ts"
import { inputClass, type Platform } from "./platformApi.ts"
import { SettingsFields } from "./SettingsFields.tsx"

const withoutKey = <Value,>(
  record: Record<string, Value>,
  key: string,
) =>
  Object.fromEntries(
    Object.entries(record).filter(
      ([entry]) => entry !== key,
    ),
  )

/** Each device inherits a shared composition and stores only its changed inputs and settings. */
export const DeviceViewVariants = ({
  device,
  platform,
  onChange,
}: {
  device: Device
  platform: Platform
  onChange: (updates: Partial<Device>) => void
}) => {
  const [viewId, setViewId] = useState(
    () =>
      Object.keys(device.viewOverrides ?? {})[0] ??
      platform.views[0]?.id ??
      "",
  )
  const view =
    platform.views.find(
      (candidate) => candidate.id === viewId,
    ) ?? platform.views[0]
  const override =
    view &&
    device.viewOverrides &&
    Object.hasOwn(device.viewOverrides, view.id)
      ? device.viewOverrides[view.id]
      : undefined
  const update = (next: DeviceViewOverride | undefined) => {
    if (!view) return
    const overrides = withoutKey(
      device.viewOverrides ?? {},
      view.id,
    )
    const viewOverrides = next
      ? { ...overrides, [view.id]: next }
      : overrides
    onChange({
      viewOverrides: Object.keys(viewOverrides).length
        ? viewOverrides
        : undefined,
    })
  }
  const updatePanel = (
    panelId: string,
    next: DeviceViewOverride["panels"][string] | undefined,
  ) => {
    const panels = withoutKey(
      override?.panels ?? {},
      panelId,
    )
    const hasPanelChanges =
      next &&
      (Object.keys(next.bindings ?? {}).length > 0 ||
        Object.keys(next.settings ?? {}).length > 0)
    update({
      ...override,
      panels: hasPanelChanges
        ? { ...panels, [panelId]: next }
        : panels,
    })
  }
  return (
    <Card heading="View variants">
      <div className="grid gap-4">
        <p>
          Use one shared view on several devices. Change a
          panel's input or settings here when this device
          needs something different.
        </p>
        <Field label="Shared view">
          <Picker
            label="Shared view"
            value={view?.id ?? ""}
            onChange={setViewId}
            options={platform.views.map((candidate) => ({
              value: candidate.id,
              label: `${candidate.name}${Object.hasOwn(device.viewOverrides ?? {}, candidate.id) ? " · Customized" : ""}`,
            }))}
          />
        </Field>
        {view ? (
          <>
            <Checkbox
              label="Customize this view on this device"
              isChecked={Boolean(override)}
              onChange={(isChecked) =>
                update(
                  isChecked ? { panels: {} } : undefined,
                )
              }
            />
            {override ? (
              <>
                <Field
                  label="Variant name"
                  description={`Leave blank to use ${view.name}. The shared view keeps its name.`}
                >
                  <input
                    className={inputClass}
                    value={override.name ?? ""}
                    maxLength={160}
                    onChange={(event) =>
                      update({
                        ...override,
                        name:
                          event.target.value || undefined,
                      })
                    }
                  />
                </Field>
                <Accordion
                  isMultiple
                  items={view.panels.map((panel) => {
                    const spec = platform.viewSpecs.find(
                      (candidate) =>
                        candidate.id === panel.specId,
                    )
                    const changes = Object.hasOwn(
                      override.panels,
                      panel.id,
                    )
                      ? override.panels[panel.id]
                      : undefined
                    return {
                      key: panel.id,
                      label: `${String(panel.settings.title || spec?.name || panel.id)}${changes ? " · Customized" : ""}`,
                      content: (
                        <div className="grid gap-4">
                          {(spec?.inputs ?? []).map(
                            (input) => (
                              <Field
                                key={input.key}
                                label={input.label}
                                description={`Shared input: ${platform.channels.find((channel) => channel.id === panel.bindings[input.key])?.name ?? "None"}`}
                              >
                                <Picker
                                  label={input.label}
                                  value={
                                    changes?.bindings?.[
                                      input.key
                                    ] ?? "__inherit"
                                  }
                                  options={[
                                    {
                                      value: "__inherit",
                                      label:
                                        "Use shared input",
                                    },
                                    ...(!input.isRequired
                                      ? [
                                          {
                                            value: "",
                                            label: "None",
                                          },
                                        ]
                                      : []),
                                    ...platform.channels
                                      .filter(
                                        (channel) =>
                                          channel.type ===
                                          input.type,
                                      )
                                      .map((channel) => ({
                                        value: channel.id,
                                        label: channel.name,
                                      })),
                                  ]}
                                  onChange={(channelId) => {
                                    const bindings =
                                      withoutKey(
                                        changes?.bindings ??
                                          {},
                                        input.key,
                                      )
                                    updatePanel(panel.id, {
                                      ...changes,
                                      bindings:
                                        channelId ===
                                        "__inherit"
                                          ? bindings
                                          : {
                                              ...bindings,
                                              [input.key]:
                                                channelId,
                                            },
                                    })
                                  }}
                                />
                              </Field>
                            ),
                          )}
                          {(spec?.settings ?? []).map(
                            (field) => {
                              const plainKey =
                                field.key.replace(
                                  /Json$/,
                                  "",
                                )
                              const key =
                                field.key.endsWith(
                                  "Json",
                                ) &&
                                Object.hasOwn(
                                  panel.settings,
                                  plainKey,
                                )
                                  ? plainKey
                                  : field.key
                              const isCustomized =
                                Object.hasOwn(
                                  changes?.settings ?? {},
                                  key,
                                )
                              const setCustomization = (
                                isCustomized: boolean,
                              ) => {
                                const settings = withoutKey(
                                  changes?.settings ?? {},
                                  key,
                                )
                                const value =
                                  panel.settings[key] ??
                                  field.defaultValue ??
                                  (field.type === "boolean"
                                    ? false
                                    : field.type ===
                                        "string-list"
                                      ? []
                                      : field.type ===
                                          "number"
                                        ? 0
                                        : "")
                                updatePanel(panel.id, {
                                  ...changes,
                                  settings: isCustomized
                                    ? {
                                        ...settings,
                                        [key]: value,
                                      }
                                    : settings,
                                })
                              }
                              return (
                                <div
                                  key={key}
                                  className="grid gap-2"
                                >
                                  {isCustomized ? (
                                    <>
                                      <SettingsFields
                                        fields={[field]}
                                        values={{
                                          ...panel.settings,
                                          ...changes?.settings,
                                        }}
                                        onChange={(
                                          settings,
                                        ) =>
                                          updatePanel(
                                            panel.id,
                                            {
                                              ...changes,
                                              settings: {
                                                ...changes?.settings,
                                                [key]:
                                                  settings[
                                                    key
                                                  ],
                                              },
                                            },
                                          )
                                        }
                                      />
                                      <Button
                                        appearance="ghost"
                                        type="button"
                                        aria-label={`Use shared ${field.label}`}
                                        onClick={() =>
                                          setCustomization(
                                            false,
                                          )
                                        }
                                      >
                                        <RotateCcw
                                          size={16}
                                          aria-hidden="true"
                                        />{" "}
                                        Use shared value
                                      </Button>
                                    </>
                                  ) : (
                                    <div className="flex items-center justify-between gap-3">
                                      <span>
                                        {field.label}
                                      </span>
                                      <Button
                                        appearance="outline"
                                        type="button"
                                        aria-label={`Customize ${field.label}`}
                                        onClick={() =>
                                          setCustomization(
                                            true,
                                          )
                                        }
                                      >
                                        <Pencil
                                          size={16}
                                          aria-hidden="true"
                                        />{" "}
                                        Customize
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              )
                            },
                          )}
                          <Button
                            appearance="outline"
                            type="button"
                            isDisabled={!changes}
                            onClick={() =>
                              updatePanel(
                                panel.id,
                                undefined,
                              )
                            }
                          >
                            <RotateCcw
                              size={16}
                              aria-hidden="true"
                            />{" "}
                            Use shared panel
                          </Button>
                        </div>
                      ),
                    }
                  })}
                />
                <p>
                  <SlidersHorizontal
                    size={16}
                    aria-hidden="true"
                  />{" "}
                  Layout, appearance, access, and control
                  permissions follow the shared view.
                </p>
              </>
            ) : (
              <p>
                This device uses the shared view. Later
                shared changes apply automatically.
              </p>
            )}
          </>
        ) : (
          <p>Create a shared view first.</p>
        )}
      </div>
    </Card>
  )
}
