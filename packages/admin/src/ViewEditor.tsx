import {
  Button,
  Card,
  Checkbox,
  Field,
  Picker,
} from "@charcuterie/ui"
import { useState } from "react"
import {
  initialSettings,
  inputClass,
  type Panel,
  type Platform,
  type View,
} from "./platformApi.ts"
import { SettingsFields } from "./SettingsFields.tsx"

export const AccessFields = ({
  value,
  onChange,
  pin,
  onPinChange,
}: {
  value: {
    access: "public" | "pin"
    hasPin?: boolean
    sessionMinutes?: number
  }
  onChange: (value: {
    access: "public" | "pin"
    sessionMinutes?: number
  }) => void
  pin: string
  onPinChange: (value: string) => void
}) => (
  <Card heading="Access">
    <div className="grid gap-4">
      <Field label="Who can open this link?">
        <Picker
          label="Who can open this link?"
          value={value.access}
          options={[
            { value: "public", label: "Public" },
            { value: "pin", label: "PIN protected" },
          ]}
          onChange={(access) =>
            onChange({
              ...value,
              access: access as "public" | "pin",
            })
          }
        />
      </Field>
      {value.access === "pin" ? (
        <>
          <Field
            label={value.hasPin ? "Replace PIN" : "PIN"}
            description={
              value.hasPin
                ? "Leave blank to keep the saved PIN."
                : "PIN not set. Set a PIN to let visitors unlock this page with its on-screen keypad. Management can preview it now."
            }
            isRequired={!value.hasPin}
          >
            <input
              className={inputClass}
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={pin}
              onChange={(event) =>
                onPinChange(event.target.value)
              }
            />
          </Field>
          <Field
            label="Unlock duration (minutes)"
            description="The page locks when this session expires."
          >
            <input
              className={inputClass}
              type="number"
              min={1}
              max={525600}
              value={value.sessionMinutes ?? 60}
              onChange={(event) =>
                onChange({
                  ...value,
                  sessionMinutes: Number(
                    event.target.value,
                  ),
                })
              }
            />
          </Field>
        </>
      ) : null}
    </div>
  </Card>
)

export const ViewEditor = ({
  value,
  onChange,
  platform,
  pin,
  onPinChange,
}: {
  value: View
  onChange: (value: View) => void
  platform: Platform
  pin: string
  onPinChange: (value: string) => void
}) => {
  const [presetId, setPresetId] = useState("")
  const changePanel = (
    panelId: string,
    next: Partial<Panel>,
  ) =>
    onChange({
      ...value,
      panels: value.panels.map((panel) =>
        panel.id === panelId
          ? { ...panel, ...next }
          : panel,
      ),
    })
  const newPanel = (): Panel => ({
    id: crypto.randomUUID(),
    specId: platform.viewSpecs[0]?.id ?? "",
    bindings: {},
    settings: initialSettings(
      platform.viewSpecs[0]?.settings,
    ),
  })
  return (
    <>
      <Field
        label="Start from a preset"
        description="A preset provides a layout and components. Choose your own channels for its inputs."
      >
        <Picker
          label="Start from a preset"
          value={presetId}
          options={[
            { label: "Custom layout", value: "" },
            ...(platform.presets ?? []).map((preset) => ({
              label: preset.name,
              value: preset.id,
            })),
          ]}
          onChange={(id) => {
            if (!id) {
              setPresetId("")
              return
            }
            const preset = platform.presets.find(
              (item) => item.id === id,
            )
            if (!preset) return
            if (
              value.panels.some(
                (panel) =>
                  Object.keys(panel.bindings).length,
              ) &&
              !confirm(
                "Apply this preset? It replaces the current components and channel bindings.",
              )
            )
              return
            setPresetId(id)
            onChange({
              ...value,
              layout: preset.layout,
              panels: preset.panels.map((panel) => ({
                id: panel.id,
                specId: panel.specId,
                settings: {
                  ...initialSettings(
                    platform.viewSpecs.find(
                      (spec) => spec.id === panel.specId,
                    )?.settings,
                  ),
                  ...panel.settings,
                },
                bindings: {},
              })),
            })
          }}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Layout">
          <Picker
            label="Layout"
            value={value.layout}
            options={[
              { label: "One panel", value: "single" },
              {
                label: "Two panels side by side",
                value: "split",
              },
              { label: "Grid", value: "grid" },
            ]}
            onChange={(layout) => {
              if (
                layout === "single" &&
                value.panels.length > 1 &&
                !confirm(
                  "Use one panel? This removes the other panels from this view.",
                )
              )
                return
              const panels =
                layout === "single"
                  ? value.panels.slice(0, 1)
                  : layout === "split"
                    ? [
                        ...value.panels,
                        newPanel(),
                        newPanel(),
                      ].slice(0, 2)
                    : value.panels
              onChange({
                ...value,
                layout: layout as View["layout"],
                panels,
              })
            }}
          />
        </Field>
        <Field label="Theme">
          <Picker
            label="Theme"
            value={value.theme}
            options={[
              { label: "Follow browser", value: "auto" },
              { label: "Light", value: "light" },
              { label: "Dark", value: "dark" },
            ]}
            onChange={(theme) =>
              onChange({
                ...value,
                theme: theme as View["theme"],
              })
            }
          />
        </Field>
      </div>
      {value.panels.map((panel, index) => {
        const spec = platform.viewSpecs.find(
          (item) => item.id === panel.specId,
        )
        return (
          <Card
            key={panel.id}
            heading={`Panel ${index + 1}`}
          >
            <div className="grid gap-4">
              <Field label={`Panel ${index + 1} view`}>
                <Picker
                  label={`Panel ${index + 1} view`}
                  value={panel.specId}
                  options={platform.viewSpecs.map(
                    (item) => ({
                      label: item.name,
                      value: item.id,
                    }),
                  )}
                  onChange={(specId) =>
                    changePanel(panel.id, {
                      specId,
                      bindings: {},
                      settings: initialSettings(
                        platform.viewSpecs.find(
                          (item) => item.id === specId,
                        )?.settings,
                      ),
                    })
                  }
                />
              </Field>
              <p className="text-content-secondary">
                {spec?.description}
              </p>
              {spec?.inputs.map((input) => {
                const channels = platform.channels.filter(
                  (channel) => channel.type === input.type,
                )
                return (
                  <Field
                    key={input.key}
                    label={`${input.label} channel`}
                    description={
                      channels.length
                        ? `${input.type} · ${input.isRequired ? "Required" : "Optional"}`
                        : `Create a ${input.type} channel in Channels first.`
                    }
                  >
                    <Picker
                      label={`${input.label} channel`}
                      options={[
                        {
                          label: input.isRequired
                            ? "Choose a channel"
                            : "None",
                          value: "",
                        },
                        ...channels.map((channel) => ({
                          label: `${channel.name} · ${platform.channelStates[channel.id]?.status ?? "waiting"}`,
                          value: channel.id,
                        })),
                      ]}
                      value={
                        panel.bindings[input.key] ?? ""
                      }
                      onChange={(id) => {
                        const bindings = {
                          ...panel.bindings,
                        }
                        if (id) bindings[input.key] = id
                        else delete bindings[input.key]
                        changePanel(panel.id, { bindings })
                      }}
                    />
                  </Field>
                )
              })}
              {spec?.settings.length ? (
                <fieldset className="grid gap-4">
                  <legend className="mb-3 font-semibold">
                    Appearance
                  </legend>
                  <SettingsFields
                    fields={spec.settings}
                    values={panel.settings}
                    onChange={(settings) =>
                      changePanel(panel.id, { settings })
                    }
                  />
                </fieldset>
              ) : null}
              <p className="text-sm text-content-secondary">
                Available on:{" "}
                {spec?.renderers.join(", ") ?? "Unknown"}
              </p>
              {value.layout === "grid" &&
              value.panels.length > 1 ? (
                <Button
                  type="button"
                  appearance="outline"
                  intent="danger"
                  onClick={() =>
                    onChange({
                      ...value,
                      panels: value.panels.filter(
                        (item) => item.id !== panel.id,
                      ),
                    })
                  }
                >
                  Remove panel {index + 1}
                </Button>
              ) : null}
            </div>
          </Card>
        )
      })}
      {value.layout === "grid" ? (
        <Button
          type="button"
          appearance="outline"
          onClick={() =>
            onChange({
              ...value,
              panels: [...value.panels, newPanel()],
            })
          }
        >
          Add panel
        </Button>
      ) : null}
      <Card heading="Theme details">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Font family"
            description="Use a font installed on the browser, or leave blank for the default."
          >
            <input
              className={inputClass}
              value={value.appearance?.fontFamily ?? ""}
              placeholder="Use theme default"
              onChange={(event) =>
                onChange({
                  ...value,
                  appearance: {
                    ...value.appearance,
                    fontFamily:
                      event.target.value || undefined,
                  },
                })
              }
            />
          </Field>
          {(
            [
              ["Accent color", "accentColor"],
              ["Background color", "backgroundColor"],
              ["Text color", "textColor"],
            ] as const
          ).map(([label, key]) => (
            <Field
              key={key}
              label={label}
              description="Use a six-digit hex color, or leave blank for the theme."
            >
              <input
                className={inputClass}
                value={value.appearance?.[key] ?? ""}
                placeholder="#3366cc"
                pattern="#[0-9a-fA-F]{6}"
                onChange={(event) =>
                  onChange({
                    ...value,
                    appearance: {
                      ...value.appearance,
                      [key]:
                        event.target.value || undefined,
                    },
                  })
                }
              />
            </Field>
          ))}
        </div>
      </Card>
      <Checkbox
        label="Allow controls in this view"
        isChecked={value.isControlEnabled}
        onChange={(isControlEnabled) =>
          onChange({ ...value, isControlEnabled })
        }
      />
      <p className="text-sm text-content-secondary">
        Controls also require an adapter that supports the
        action. A view can show live data without allowing
        changes.
      </p>
      <AccessFields
        value={value}
        onChange={(next) => onChange({ ...value, ...next })}
        pin={pin}
        onPinChange={onPinChange}
      />
    </>
  )
}
