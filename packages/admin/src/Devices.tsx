import {
  Button,
  Card,
  Checkbox,
  Field,
  Header,
  Picker,
} from "@charcuterie/ui"
import { useCallback, useEffect, useState } from "react"

import { mutate, type Platform } from "./platformApi.ts"

type Device = {
  id: string
  label: string
  mac: string
  renderer?: "browser"
  width: number
  height: number
  colorMode?: "monochrome" | "grayscale" | "spectra6"
  color?: "monochrome" | "grayscale" | "spectra6" | "full"
  rotation?: 0 | 90 | 180 | 270
  shape?: "square" | "round" | "rectangle"
  hasTouch?: boolean
  hasViewDrawer?: boolean
  /** A backlight agent listens on the device's MQTT light topics. */
  hasMqttBacklight?: boolean
  /** Ordered allow-list. Absent means every compatible view. */
  views?: string[]
  externalViews?: { name: string; url: string }[]
}

type AutomationSettings = Record<string, string>

const IMAGE_COLOR_OPTIONS = [
  { label: "Mono", value: "monochrome" },
  { label: "Grayscale (16 levels)", value: "grayscale" },
  { label: "Spectra 6", value: "spectra6" },
]
const BROWSER_COLOR_OPTIONS = [
  { label: "Full color", value: "full" },
  { label: "Grayscale", value: "grayscale" },
  { label: "Mono", value: "monochrome" },
  { label: "Spectra 6", value: "spectra6" },
]
const ROTATION_OPTIONS = [0, 90, 180, 270].map((value) => ({
  label: `${value}°`,
  value: String(value),
}))
const SHAPE_OPTIONS = ["rectangle", "square", "round"].map(
  (value) => ({
    label: value[0]?.toUpperCase() + value.slice(1),
    value,
  }),
)
const DITHER_OPTIONS = [
  "floyd-steinberg",
  "atkinson",
  "ordered",
  "off",
  "threshold",
  "stucki",
  "sierra",
].map((value) => ({ label: value, value }))
const PHOTO_FORMAT_OPTIONS = [
  "Auto",
  "JPEG",
  "WebP",
  "PNG",
].map((value) => ({ label: value, value }))
const TIME_FORMAT_OPTIONS = [
  "Auto",
  "12-hour",
  "24-hour",
].map((value) => ({ label: value, value }))
const DATE_STYLE_OPTIONS = ["Auto", "Long", "Numeric"].map(
  (value) => ({ label: value, value }),
)
const COLOR_MODE_OPTIONS = ["Color", "Black & White"].map(
  (value) => ({ label: value, value }),
)
const AUTOMATION_PICKERS: readonly {
  label: string
  kind: string
  options: readonly { label: string; value: string }[]
}[] = [
  {
    label: "Dither",
    kind: "dither",
    options: DITHER_OPTIONS,
  },
  {
    label: "Photo format",
    kind: "photoFormat",
    options: PHOTO_FORMAT_OPTIONS,
  },
  {
    label: "Time format",
    kind: "clockTimeFormat",
    options: TIME_FORMAT_OPTIONS,
  },
  {
    label: "Date style",
    kind: "clockDateStyle",
    options: DATE_STYLE_OPTIONS,
  },
  {
    label: "Display rotation",
    kind: "rotation",
    options: ROTATION_OPTIONS,
  },
]

const DEVICE_SETTING_GROUPS: {
  name: string
  fields: [string, string, string][]
  pickers: string[]
}[] = [
  {
    name: "Photo selection",
    fields: [
      ["Photo people", "photoPeople", "text"],
      ["Photo query", "photoQuery", "text"],
      ["Photo recency (days)", "photoRecency", "number"],
      ["People minimum", "photoPeopleMinimum", "number"],
    ],
    pickers: [],
  },
  {
    name: "View appearance",
    fields: [
      [
        "Photo interval (minutes)",
        "photoInterval",
        "number",
      ],
      ["Clock timezone", "clockTimezone", "text"],
      ["Photo crop top (px)", "photo_crop_top", "number"],
      [
        "Photo crop right (px)",
        "photo_crop_right",
        "number",
      ],
      [
        "Photo crop bottom (px)",
        "photo_crop_bottom",
        "number",
      ],
      ["Photo crop left (px)", "photo_crop_left", "number"],
    ],
    pickers: ["clockTimeFormat", "clockDateStyle"],
  },
  {
    name: "Output profile",
    fields: [
      ["Photo quality", "photoQuality", "number"],
      ["Brightness (%)", "brightness", "number"],
      ["Saturation (%)", "saturation", "number"],
    ],
    pickers: ["dither", "photoFormat"],
  },
  {
    name: "Installation",
    fields: [
      ["Margin top (px)", "margin_top", "number"],
      ["Margin right (px)", "margin_right", "number"],
      ["Margin bottom (px)", "margin_bottom", "number"],
      ["Margin left (px)", "margin_left", "number"],
    ],
    pickers: [],
  },
]

const getBlankDevice = (): Device => ({
  id: "",
  label: "",
  mac: "",
  width: 800,
  height: 480,
  colorMode: "spectra6",
  rotation: 0,
})

const getRequestHeaders = () => ({
  "Content-Type": "application/json",
})

export const Devices = ({
  platform,
  onRefresh,
}: {
  platform: Platform
  onRefresh: () => Promise<void>
}) => {
  const [screenId, setScreenId] = useState("")
  const [isSavingScreen, setIsSavingScreen] =
    useState(false)
  const [devices, setDevices] = useState<readonly Device[]>(
    [],
  )
  const [selectedDevice, setSelectedDevice] =
    useState<Device | null>(null)
  const [message, setMessage] = useState(
    "Select a device to edit its installation.",
  )
  const [isSaving, setIsSaving] = useState(false)
  const [automationSettings, setAutomationSettings] =
    useState<AutomationSettings>({})
  const [isSavingAutomation, setIsSavingAutomation] =
    useState(false)

  useEffect(() => {
    setScreenId(
      platform.deviceScreens?.[selectedDevice?.id ?? ""] ??
        "",
    )
  }, [platform.deviceScreens, selectedDevice?.id])
  const saveScreen = async () => {
    if (!selectedDevice) return
    setIsSavingScreen(true)
    try {
      await mutate(
        `/api/manage/platform/device-screens/${encodeURIComponent(selectedDevice.id)}`,
        { screenId: screenId || null },
        "PUT",
      )
      setMessage(
        "Display screen saved. The device keeps its existing URL.",
      )
      await onRefresh()
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not save display screen.",
      )
    } finally {
      setIsSavingScreen(false)
    }
  }

  const loadDevices = useCallback(async () => {
    const response = await fetch("/api/manage/devices", {
      headers: getRequestHeaders(),
    })
    if (!response.ok) {
      setMessage(
        response.status === 401
          ? "Your session expired. Open Access to sign in."
          : "Could not load devices.",
      )
      return
    }
    const body = (await response.json()) as {
      devices: Device[]
    }
    setDevices(body.devices)
    setSelectedDevice(
      (currentDevice) =>
        body.devices.find(
          (device) => device.id === currentDevice?.id,
        ) ??
        body.devices[0] ??
        null,
    )
    setMessage(
      body.devices.length === 0
        ? "No devices are configured yet."
        : "Select a device to edit it.",
    )
  }, [])

  useEffect(() => {
    void loadDevices()
  }, [loadDevices])

  useEffect(() => {
    if (!selectedDevice) {
      setAutomationSettings({})
      return
    }
    const loadAutomationSettings = async () => {
      const response = await fetch(
        `/api/manage/devices/${selectedDevice.id}/settings`,
        { headers: getRequestHeaders() },
      )
      if (!response.ok) {
        return
      }
      const body = (await response.json()) as {
        settings: AutomationSettings
      }
      setAutomationSettings(body.settings)
    }
    void loadAutomationSettings()
  }, [selectedDevice?.id, selectedDevice])

  const updateSelectedDevice = (
    updates: Partial<Device>,
  ) => {
    setSelectedDevice((currentDevice) =>
      currentDevice
        ? { ...currentDevice, ...updates }
        : currentDevice,
    )
  }

  const saveDevice = async () => {
    if (!selectedDevice) {
      return
    }
    setIsSaving(true)
    const isNewDevice = !devices.some(
      (device) => device.id === selectedDevice.id,
    )
    const response = await fetch(
      isNewDevice
        ? "/api/manage/devices"
        : `/api/manage/devices/${selectedDevice.id}`,
      {
        body: JSON.stringify(selectedDevice),
        headers: getRequestHeaders(),
        method: isNewDevice ? "POST" : "PUT",
      },
    )
    const body = (await response
      .json()
      .catch(() => ({}))) as { error?: string }
    setMessage(
      response.ok
        ? "Saved. CastKit is restarting to publish Home Assistant discovery."
        : (body.error ?? "Could not save device."),
    )
    setIsSaving(false)
  }

  const deleteDevice = async () => {
    if (
      !selectedDevice ||
      !confirm(`Delete ${selectedDevice.label}?`)
    ) {
      return
    }
    const response = await fetch(
      `/api/manage/devices/${selectedDevice.id}`,
      {
        headers: getRequestHeaders(),
        method: "DELETE",
      },
    )
    setMessage(
      response.ok
        ? "Deleted. CastKit is restarting to remove its Home Assistant discovery."
        : "Could not delete device.",
    )
  }

  const saveAutomationSettings = async () => {
    if (!selectedDevice) {
      return
    }
    setIsSavingAutomation(true)
    const settings = Object.entries(automationSettings).map(
      ([kind, payload]) => ({ kind, payload }),
    )
    const response = await fetch(
      `/api/manage/devices/${selectedDevice.id}/settings`,
      {
        body: JSON.stringify({ settings }),
        headers: getRequestHeaders(),
        method: "PUT",
      },
    )
    setMessage(
      response.ok
        ? "Saved display settings."
        : "Could not save display settings.",
    )
    setIsSavingAutomation(false)
  }

  const updateAutomationSetting = ({
    kind,
    value,
  }: {
    kind: string
    value: string
  }) => {
    setAutomationSettings((currentSettings) => ({
      ...currentSettings,
      [kind]: value,
    }))
  }

  const isBrowserDevice =
    selectedDevice?.renderer === "browser"

  return (
    <div className="grid gap-4">
      <Header
        actions={
          <Button
            appearance="outline"
            onClick={() =>
              setSelectedDevice(getBlankDevice())
            }
          >
            Add device
          </Button>
        }
        heading="Devices"
        isSticky
      />
      <div>
        <div className="grid gap-4 xl:grid-cols-[minmax(18rem,.8fr)_minmax(0,1.2fr)]">
          <Card padding="none">
            <h2 className="border-b border-border-subtle px-4 py-4 font-semibold text-lg">
              Devices
            </h2>
            <div className="divide-y divide-border-subtle">
              {devices.map((device) => (
                <button
                  className={`w-full px-4 py-3 text-start hover:bg-surface-sunken ${selectedDevice?.id === device.id ? "border-s-4 border-intent-accent-border bg-intent-accent-surface" : ""}`}
                  key={device.id}
                  onClick={() => setSelectedDevice(device)}
                  type="button"
                >
                  <strong>{device.label}</strong>
                  <span className="mt-1 block text-content-secondary text-sm">
                    {device.renderer === "browser"
                      ? "Browser"
                      : "Image"}{" "}
                    · {device.width} × {device.height}
                  </span>
                </button>
              ))}
            </div>
          </Card>
          <Card
            heading={
              selectedDevice
                ? devices.some(
                    (device) =>
                      device.id === selectedDevice.id,
                  )
                  ? selectedDevice.label
                  : "New device"
                : "Select a device"
            }
          >
            {selectedDevice ? (
              <form
                className="grid gap-4"
                onSubmit={(event) => {
                  event.preventDefault()
                  void saveDevice()
                }}
              >
                {devices.some(
                  (device) =>
                    device.id === selectedDevice.id,
                ) ? (
                  <Card heading="Assigned screen">
                    <div className="grid gap-4">
                      <Field
                        label="Screen"
                        description="A screen selects from saved views. The physical display keeps its current device URL."
                      >
                        <Picker
                          label="Screen"
                          value={screenId}
                          options={[
                            {
                              label:
                                "Use existing device views",
                              value: "",
                            },
                            ...platform.screens.map(
                              (screen) => ({
                                label: screen.name,
                                value: screen.id,
                              }),
                            ),
                          ]}
                          onChange={setScreenId}
                        />
                      </Field>
                      <Button
                        type="button"
                        appearance="outline"
                        isLoading={isSavingScreen}
                        onClick={() => void saveScreen()}
                      >
                        Assign screen
                      </Button>
                    </div>
                  </Card>
                ) : null}
                <Field label="Name">
                  <input
                    className="w-full rounded-md border border-border-default bg-surface-base px-3 py-2"
                    onChange={(event) =>
                      updateSelectedDevice({
                        label: event.target.value,
                      })
                    }
                    value={selectedDevice.label}
                  />
                </Field>
                <Field
                  description="This identifier is permanent after creation. Use lowercase letters, numbers, and hyphens."
                  label="Device id"
                >
                  <input
                    className="w-full rounded-md border border-border-default bg-surface-base px-3 py-2"
                    disabled={devices.some(
                      (device) =>
                        device.id === selectedDevice.id,
                    )}
                    onChange={(event) =>
                      updateSelectedDevice({
                        id: event.target.value,
                      })
                    }
                    value={selectedDevice.id}
                  />
                </Field>
                <Field label="MAC address">
                  <input
                    className="w-full rounded-md border border-border-default bg-surface-base px-3 py-2"
                    onChange={(event) =>
                      updateSelectedDevice({
                        mac: event.target.value,
                      })
                    }
                    value={selectedDevice.mac}
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Width">
                    <input
                      className="w-full rounded-md border border-border-default bg-surface-base px-3 py-2"
                      min="1"
                      onChange={(event) =>
                        updateSelectedDevice({
                          width: Number(event.target.value),
                        })
                      }
                      type="number"
                      value={selectedDevice.width}
                    />
                  </Field>
                  <Field label="Height">
                    <input
                      className="w-full rounded-md border border-border-default bg-surface-base px-3 py-2"
                      min="1"
                      onChange={(event) =>
                        updateSelectedDevice({
                          height: Number(
                            event.target.value,
                          ),
                        })
                      }
                      type="number"
                      value={selectedDevice.height}
                    />
                  </Field>
                </div>
                <Field label="Renderer">
                  <Picker
                    label="Renderer"
                    onChange={(value) =>
                      updateSelectedDevice(
                        value === "browser"
                          ? {
                              renderer: "browser",
                              color: "full",
                              shape: "rectangle",
                              hasViewDrawer: false,
                            }
                          : {
                              renderer: undefined,
                              color: undefined,
                              shape: undefined,
                              hasTouch: undefined,
                              hasViewDrawer: undefined,
                              views: undefined,
                              colorMode: "spectra6",
                              rotation: 0,
                            },
                      )
                    }
                    options={[
                      { label: "Image", value: "image" },
                      {
                        label: "Browser",
                        value: "browser",
                      },
                    ]}
                    value={
                      isBrowserDevice ? "browser" : "image"
                    }
                  />
                </Field>
                {isBrowserDevice ? (
                  <>
                    <Field label="Color">
                      <Picker
                        label="Color"
                        onChange={(value) =>
                          updateSelectedDevice({
                            color: value as Device["color"],
                          })
                        }
                        options={BROWSER_COLOR_OPTIONS}
                        value={selectedDevice.color}
                      />
                    </Field>
                    <Field label="Shape">
                      <Picker
                        label="Shape"
                        onChange={(value) =>
                          updateSelectedDevice({
                            shape: value as Device["shape"],
                          })
                        }
                        options={SHAPE_OPTIONS}
                        value={selectedDevice.shape}
                      />
                    </Field>
                    <Checkbox
                      isChecked={
                        selectedDevice.hasTouch ?? false
                      }
                      key={selectedDevice.id}
                      label="Touch enabled"
                      onChange={(hasTouch) =>
                        updateSelectedDevice({ hasTouch })
                      }
                    />
                    <Checkbox
                      isChecked={
                        selectedDevice.hasViewDrawer ??
                        false
                      }
                      key={`${selectedDevice.id}-view-drawer`}
                      label="Show edge view drawer"
                      onChange={(hasViewDrawer) =>
                        updateSelectedDevice({
                          hasViewDrawer,
                        })
                      }
                    />
                    <Field label="Views">
                      <div>
                        <input
                          className="w-full rounded-md border border-border-default bg-surface-base px-3 py-2"
                          onChange={(event) => {
                            const views = event.target.value
                              .split(",")
                              .map((name) => name.trim())
                              .filter(Boolean)
                            updateSelectedDevice({
                              views:
                                views.length > 0
                                  ? views
                                  : undefined,
                            })
                          }}
                          placeholder="All compatible views"
                          type="text"
                          value={
                            selectedDevice.views?.join(
                              ", ",
                            ) ?? ""
                          }
                        />
                        <p className="mt-2 text-content-secondary text-sm">
                          Comma-separated names in drawer
                          and selector order. Leave blank to
                          offer every compatible view.
                        </p>
                      </div>
                    </Field>
                    <Field label="Display rotation">
                      <Picker
                        label="Display rotation"
                        onChange={(value) =>
                          updateSelectedDevice({
                            rotation: Number(
                              value,
                            ) as Device["rotation"],
                          })
                        }
                        options={ROTATION_OPTIONS}
                        value={String(
                          selectedDevice.rotation ?? 0,
                        )}
                      />
                    </Field>
                    {selectedDevice.hasMqttBacklight ? (
                      <Card heading="Display operations">
                        <p className="mb-4 text-content-secondary text-sm">
                          The backlight level CastKit keeps
                          for this display and sends again
                          when its backlight agent
                          reconnects. Home Assistant exposes
                          the same control as Display:
                          Backlight level.
                        </p>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field label="Backlight (%)">
                            <input
                              className="w-full rounded-md border border-border-default bg-surface-base px-3 py-2"
                              max={100}
                              min={0}
                              onChange={(event) =>
                                updateAutomationSetting({
                                  kind: "backlightLevel",
                                  value: event.target.value,
                                })
                              }
                              step={1}
                              type="number"
                              value={
                                automationSettings.backlightLevel ??
                                ""
                              }
                            />
                          </Field>
                        </div>
                        <div className="mt-4">
                          <Button
                            isLoading={isSavingAutomation}
                            onClick={() =>
                              void saveAutomationSettings()
                            }
                            type="button"
                          >
                            Save display settings
                          </Button>
                        </div>
                      </Card>
                    ) : null}
                  </>
                ) : (
                  <>
                    <Field label="Color mode">
                      <Picker
                        label="Color mode"
                        onChange={(value) =>
                          updateSelectedDevice({
                            colorMode:
                              value as Device["colorMode"],
                          })
                        }
                        options={IMAGE_COLOR_OPTIONS}
                        value={selectedDevice.colorMode}
                      />
                    </Field>
                    <Field label="Rotation">
                      <Picker
                        label="Rotation"
                        onChange={(value) =>
                          updateSelectedDevice({
                            rotation: Number(
                              value,
                            ) as Device["rotation"],
                          })
                        }
                        options={ROTATION_OPTIONS}
                        value={String(
                          selectedDevice.rotation ?? 0,
                        )}
                      />
                    </Field>
                    <Card heading="Display settings">
                      <p className="mb-4 text-content-secondary text-sm">
                        These settings apply to this
                        device's existing views. Named
                        channels and saved views have their
                        own settings in Channels and Views.
                      </p>
                      {DEVICE_SETTING_GROUPS.map(
                        (group) => (
                          <fieldset
                            className="mb-6 grid gap-4 sm:grid-cols-2"
                            key={group.name}
                          >
                            <legend className="mb-3 font-semibold">
                              {group.name}
                            </legend>
                            {group.fields.map(
                              ([label, kind, type]) => (
                                <Field
                                  key={kind}
                                  label={label}
                                >
                                  <input
                                    className="w-full rounded-md border border-border-default bg-surface-base px-3 py-2"
                                    onChange={(event) =>
                                      updateAutomationSetting(
                                        {
                                          kind,
                                          value:
                                            event.target
                                              .value,
                                        },
                                      )
                                    }
                                    type={type}
                                    value={
                                      automationSettings[
                                        kind
                                      ] ?? ""
                                    }
                                  />
                                </Field>
                              ),
                            )}
                            {AUTOMATION_PICKERS.filter(
                              ({ kind }) =>
                                group.pickers.includes(
                                  kind,
                                ),
                            ).map(
                              ({
                                label,
                                kind,
                                options,
                              }) => (
                                <Field
                                  key={kind}
                                  label={label}
                                >
                                  <Picker
                                    label={label}
                                    options={options}
                                    value={
                                      automationSettings[
                                        kind
                                      ] ?? ""
                                    }
                                    onChange={(value) =>
                                      updateAutomationSetting(
                                        { kind, value },
                                      )
                                    }
                                  />
                                </Field>
                              ),
                            )}
                            {group.name ===
                              "Output profile" &&
                            selectedDevice.colorMode ===
                              "spectra6" ? (
                              <Field label="Color mode">
                                <Picker
                                  label="Color mode"
                                  options={
                                    COLOR_MODE_OPTIONS
                                  }
                                  value={
                                    automationSettings.colorMode ??
                                    "Color"
                                  }
                                  onChange={(value) =>
                                    updateAutomationSetting(
                                      {
                                        kind: "colorMode",
                                        value,
                                      },
                                    )
                                  }
                                />
                              </Field>
                            ) : null}
                          </fieldset>
                        ),
                      )}
                      <Checkbox
                        isChecked={
                          automationSettings.updates !==
                          "OFF"
                        }
                        label="Accept updates"
                        onChange={(isEnabled) =>
                          updateAutomationSetting({
                            kind: "updates",
                            value: isEnabled ? "ON" : "OFF",
                          })
                        }
                      />
                      <div className="mt-4">
                        <Button
                          isLoading={isSavingAutomation}
                          onClick={() =>
                            void saveAutomationSettings()
                          }
                          type="button"
                        >
                          Save display settings
                        </Button>
                      </div>
                    </Card>
                  </>
                )}
                <p
                  className="text-content-secondary text-sm"
                  role="status"
                >
                  {message}
                </p>
                <div className="flex flex-wrap justify-between gap-2">
                  <Button
                    appearance="outline"
                    intent="danger"
                    onClick={() => void deleteDevice()}
                  >
                    Delete device
                  </Button>
                  <Button
                    isLoading={isSaving}
                    type="submit"
                  >
                    Save and restart
                  </Button>
                </div>
              </form>
            ) : (
              <p className="text-content-secondary">
                Choose a device from the list, or add a new
                one.
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
