import {
  Button,
  Card,
  Checkbox,
  Field,
  Header,
  Main,
  Picker,
  Shell,
} from "@charcuterie/ui"
import { useCallback, useEffect, useState } from "react"

type Device = {
  id: string
  label: string
  mac: string
  renderer?: "browser"
  width: number
  height: number
  colourMode?: "mono" | "e6"
  colour?: "mono" | "grayscale" | "e6" | "full"
  rotation?: 0 | 90 | 180 | 270
  shape?: "square" | "round" | "rect"
  hasTouch?: boolean
}

type AutomationSettings = Record<string, string>

const IMAGE_COLOUR_OPTIONS = [
  { label: "Mono", value: "mono" },
  { label: "Spectra 6", value: "e6" },
]
const BROWSER_COLOUR_OPTIONS = [
  { label: "Full colour", value: "full" },
  { label: "Greyscale", value: "grayscale" },
  { label: "Mono", value: "mono" },
  { label: "Spectra 6", value: "e6" },
]
const ROTATION_OPTIONS = [0, 90, 180, 270].map((value) => ({
  label: `${value}°`,
  value: String(value),
}))
const SHAPE_OPTIONS = ["rect", "square", "round"].map(
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
const COLOUR_MODE_OPTIONS = ["Color", "Black & White"].map(
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

const getBlankDevice = (): Device => ({
  id: "",
  label: "",
  mac: "",
  width: 800,
  height: 480,
  colourMode: "e6",
  rotation: 0,
})

const getRequestHeaders = (apiToken: string) => ({
  "Content-Type": "application/json",
  ...(apiToken
    ? { Authorization: `Bearer ${apiToken}` }
    : {}),
})

export const App = () => {
  const [apiToken, setApiToken] = useState(
    () => sessionStorage.getItem("castkit-api-token") ?? "",
  )
  const [devices, setDevices] = useState<readonly Device[]>(
    [],
  )
  const [selectedDevice, setSelectedDevice] =
    useState<Device | null>(null)
  const [message, setMessage] = useState(
    "Enter the API token when your CastKit server uses one.",
  )
  const [isSaving, setIsSaving] = useState(false)
  const [automationSettings, setAutomationSettings] =
    useState<AutomationSettings>({})
  const [isSavingAutomation, setIsSavingAutomation] =
    useState(false)

  const loadDevices = useCallback(async () => {
    const response = await fetch("/api/manage/devices", {
      headers: getRequestHeaders(apiToken),
    })
    if (!response.ok) {
      setMessage(
        response.status === 401
          ? "Enter the CastKit API token to manage devices."
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
  }, [apiToken])

  useEffect(() => {
    void loadDevices()
  }, [loadDevices])

  useEffect(() => {
    if (
      !selectedDevice ||
      selectedDevice.renderer === "browser"
    ) {
      setAutomationSettings({})
      return
    }
    const loadAutomationSettings = async () => {
      const response = await fetch(
        `/api/manage/devices/${selectedDevice.id}/settings`,
        { headers: getRequestHeaders(apiToken) },
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
  }, [
    apiToken,
    selectedDevice?.id,
    selectedDevice?.renderer,
    selectedDevice,
  ])

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
    sessionStorage.setItem("castkit-api-token", apiToken)
    const isNewDevice = !devices.some(
      (device) => device.id === selectedDevice.id,
    )
    const response = await fetch(
      isNewDevice
        ? "/api/manage/devices"
        : `/api/manage/devices/${selectedDevice.id}`,
      {
        body: JSON.stringify(selectedDevice),
        headers: getRequestHeaders(apiToken),
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
        headers: getRequestHeaders(apiToken),
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
        headers: getRequestHeaders(apiToken),
        method: "PUT",
      },
    )
    setMessage(
      response.ok
        ? "Sent automation settings to CastKit."
        : "Could not save automation settings.",
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
    <Shell contentWidth="full">
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
        heading="CastKit device management"
        isSticky
      />
      <Main className="p-4 md:p-6">
        <div className="grid gap-4 xl:grid-cols-[minmax(18rem,.8fr)_minmax(0,1.2fr)]">
          <Card heading="Devices" padding="none">
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
                              colour: "full",
                              shape: "rect",
                            }
                          : {
                              renderer: undefined,
                              colour: undefined,
                              shape: undefined,
                              hasTouch: undefined,
                              colourMode: "e6",
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
                    <Field label="Colour">
                      <Picker
                        label="Colour"
                        onChange={(value) =>
                          updateSelectedDevice({
                            colour:
                              value as Device["colour"],
                          })
                        }
                        options={BROWSER_COLOUR_OPTIONS}
                        value={selectedDevice.colour}
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
                  </>
                ) : (
                  <>
                    <Field label="Colour mode">
                      <Picker
                        label="Colour mode"
                        onChange={(value) =>
                          updateSelectedDevice({
                            colourMode:
                              value as Device["colourMode"],
                          })
                        }
                        options={IMAGE_COLOUR_OPTIONS}
                        value={selectedDevice.colourMode}
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
                    <Card heading="Automation settings">
                      <p className="mb-4 text-content-secondary text-sm">
                        These are the same per-display
                        controls that Home Assistant exposes
                        over MQTT. Use Home Assistant for
                        automations, or change them here for
                        direct setup.
                      </p>
                      <div className="grid gap-4 sm:grid-cols-2">
                        {[
                          [
                            "Photo people",
                            "photoPeople",
                            "text",
                          ],
                          [
                            "Photo query",
                            "photoQuery",
                            "text",
                          ],
                          [
                            "Photo interval (minutes)",
                            "photoInterval",
                            "number",
                          ],
                          [
                            "Photo recency (days)",
                            "photoRecency",
                            "number",
                          ],
                          [
                            "People minimum",
                            "photoPeopleMinimum",
                            "number",
                          ],
                          [
                            "Photo quality",
                            "photoQuality",
                            "number",
                          ],
                          [
                            "Clock timezone",
                            "clockTimezone",
                            "text",
                          ],
                          [
                            "Brightness (%)",
                            "brightness",
                            "number",
                          ],
                          [
                            "Saturation (%)",
                            "saturation",
                            "number",
                          ],
                          [
                            "Crop top (px)",
                            "crop_top",
                            "number",
                          ],
                          [
                            "Crop right (px)",
                            "crop_right",
                            "number",
                          ],
                          [
                            "Crop bottom (px)",
                            "crop_bottom",
                            "number",
                          ],
                          [
                            "Crop left (px)",
                            "crop_left",
                            "number",
                          ],
                        ].map(([label, kind, type]) => (
                          <Field key={kind} label={label}>
                            <input
                              className="w-full rounded-md border border-border-default bg-surface-base px-3 py-2"
                              onChange={(event) =>
                                updateAutomationSetting({
                                  kind,
                                  value: event.target.value,
                                })
                              }
                              type={type}
                              value={
                                automationSettings[kind] ??
                                ""
                              }
                            />
                          </Field>
                        ))}
                        {AUTOMATION_PICKERS.map(
                          ({ label, kind, options }) => (
                            <Field key={kind} label={label}>
                              <Picker
                                label={label}
                                onChange={(value) =>
                                  updateAutomationSetting({
                                    kind,
                                    value,
                                  })
                                }
                                options={options}
                                value={
                                  automationSettings[
                                    kind
                                  ] ?? ""
                                }
                              />
                            </Field>
                          ),
                        )}
                        {selectedDevice.colourMode ===
                        "e6" ? (
                          <Field label="Colour mode">
                            <Picker
                              label="Colour mode"
                              onChange={(value) =>
                                updateAutomationSetting({
                                  kind: "colourMode",
                                  value,
                                })
                              }
                              options={COLOUR_MODE_OPTIONS}
                              value={
                                automationSettings.colourMode ??
                                "Color"
                              }
                            />
                          </Field>
                        ) : null}
                      </div>
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
                          Save automation settings
                        </Button>
                      </div>
                    </Card>
                  </>
                )}
                <Field
                  description="Stored only in this browser session. Leave blank when the API is open on your local network."
                  label="API token"
                >
                  <input
                    className="w-full rounded-md border border-border-default bg-surface-base px-3 py-2"
                    onChange={(event) =>
                      setApiToken(event.target.value)
                    }
                    type="password"
                    value={apiToken}
                  />
                </Field>
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
      </Main>
    </Shell>
  )
}
