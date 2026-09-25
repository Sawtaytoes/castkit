import {
  AdaptiveGrid,
  Button,
  Card,
  Field,
  Tabs,
} from "@charcuterie/ui"
import { useCallback, useEffect, useState } from "react"
import {
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router"
import { DeviceFields } from "./DeviceFields.tsx"
import { DevicePreview } from "./DevicePreview.tsx"
import { DeviceSettingsFields } from "./DeviceSettingsFields.tsx"
import type {
  AutomationSettings,
  Device,
} from "./device.ts"
import { mutate, type Platform } from "./platformApi.ts"
import { SettingField } from "./SettingField.tsx"

const getBlankDevice = (): Device => ({
  id: "",
  label: "",
  mac: "",
  width: 800,
  height: 480,
  colorMode: "spectra6",
  rotation: 0,
})
const getRequestHeaders = (apiToken: string) => ({
  "Content-Type": "application/json",
  ...(apiToken
    ? { Authorization: `Bearer ${apiToken}` }
    : {}),
})
const getChangedSettings = ({
  settings,
  savedSettings,
}: {
  settings: AutomationSettings
  savedSettings: AutomationSettings
}) =>
  Object.entries(settings)
    .filter(
      ([kind, value]) => savedSettings[kind] !== value,
    )
    .map(([kind, payload]) => ({ kind, payload }))

/** The device list stays visible; route-backed tabs preserve focus and draft state. */
export const Devices = ({
  platform,
  onRefresh,
}: {
  platform: Platform
  onRefresh: () => Promise<void>
}) => {
  const navigate = useNavigate()
  const location = useLocation()
  const pathname = location.pathname.replace(
    /^\/devices/,
    "",
  )
  const [searchParams] = useSearchParams()
  const isOverview = pathname === "/all-screens"
  const selectedId = searchParams.get("device")
  const isNewDevice = searchParams.get("new") === "1"
  const [screenId, setScreenId] = useState("")
  const [isSavingScreen, setIsSavingScreen] =
    useState(false)
  const [apiToken, setApiToken] = useState(
    () => sessionStorage.getItem("castkit-api-token") ?? "",
  )
  const [tokenInput, setTokenInput] = useState(apiToken)
  const [devices, setDevices] = useState<readonly Device[]>(
    [],
  )
  const [selectedDevice, setSelectedDevice] =
    useState<Device | null>(null)
  const [automationSettings, setAutomationSettings] =
    useState<AutomationSettings>({})
  const [savedSettings, setSavedSettings] =
    useState<AutomationSettings>({})
  const [message, setMessage] = useState("")
  const [search, setSearch] = useState("")
  const [isDeviceListOpen, setIsDeviceListOpen] =
    useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingSettings, setIsLoadingSettings] =
    useState(false)
  const [hasSettingsError, setHasSettingsError] =
    useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isSavingAutomation, setIsSavingAutomation] =
    useState(false)
  const [reload, setReload] = useState(0)
  const [previewRevision, setPreviewRevision] = useState(0)
  const [hasRestartPending, setHasRestartPending] =
    useState(false)
  const savedDevice =
    devices.find((device) => device.id === selectedId) ??
    (isNewDevice ? undefined : devices[0])
  const savedId = savedDevice?.id
  const assignedScreenId =
    platform.deviceScreens?.[savedId ?? ""] ?? ""
  useEffect(
    () => setScreenId(assignedScreenId),
    [assignedScreenId],
  )
  const saveScreen = async () => {
    if (!savedId) return
    setIsSavingScreen(true)
    try {
      await mutate(
        `/api/manage/platform/device-screens/${encodeURIComponent(savedId)}`,
        { screenId: screenId || null },
        "PUT",
      )
      await onRefresh()
      setPreviewRevision((current) => current + 1)
      setMessage("Display screen saved.")
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

  const hasDeviceChanges =
    selectedDevice !== null &&
    (isNewDevice ||
      JSON.stringify(selectedDevice) !==
        JSON.stringify(savedDevice))
  const pendingSettings = getChangedSettings({
    settings: automationSettings,
    savedSettings,
  })
  const hasChanges =
    hasDeviceChanges || pendingSettings.length > 0
  const isBusy =
    isSaving || isSavingAutomation || isSavingScreen
  const isBrowser = selectedDevice?.renderer === "browser"
  const sections = isBrowser
    ? [
        "device",
        "views",
        ...(selectedDevice.hasMqttBacklight
          ? ["updates"]
          : []),
      ]
    : ["device", "photos", "clock", "image", "updates"]
  const requestedSection =
    pathname.split("/")[1] || "device"
  const section = sections.includes(requestedSection)
    ? requestedSection
    : "device"

  useEffect(() => {
    const controller = new AbortController()
    setIsLoading(true)
    const load = async () => {
      try {
        const response = await fetch(
          "/api/manage/devices",
          {
            headers: getRequestHeaders(apiToken),
            cache: reload > 0 ? "reload" : "default",
            signal: controller.signal,
          },
        )
        if (!response.ok) {
          throw new Error(
            response.status === 401
              ? "Enter the CastKit API token below to connect."
              : "Could not load devices. Try Reload devices.",
          )
        }
        const body = (await response.json()) as {
          devices: Device[]
        }
        if (!controller.signal.aborted) {
          setDevices(body.devices)
          setHasRestartPending(false)
          setMessage("")
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setMessage(
            error instanceof Error
              ? error.message
              : "Could not load devices.",
          )
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }
    void load()
    return () => controller.abort()
  }, [apiToken, reload])

  useEffect(() => {
    setSelectedDevice(
      isNewDevice
        ? getBlankDevice()
        : (savedDevice ?? null),
    )
  }, [isNewDevice, savedDevice])

  useEffect(() => {
    const controller = new AbortController()
    setAutomationSettings({})
    setSavedSettings({})
    setHasSettingsError(false)
    if (!savedId || isNewDevice) {
      setIsLoadingSettings(false)
      return
    }
    setIsLoadingSettings(true)
    const load = async () => {
      try {
        const response = await fetch(
          `/api/manage/devices/${encodeURIComponent(savedId)}/settings`,
          {
            headers: getRequestHeaders(apiToken),
            cache: reload > 0 ? "reload" : "default",
            signal: controller.signal,
          },
        )
        if (!response.ok) {
          throw new Error(
            "Could not load this device’s settings. Try Reload devices.",
          )
        }
        const body = (await response.json()) as {
          settings: AutomationSettings
        }
        if (!controller.signal.aborted) {
          setAutomationSettings(body.settings)
          setSavedSettings(body.settings)
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setHasSettingsError(true)
          setMessage(
            error instanceof Error
              ? error.message
              : "Could not load settings.",
          )
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingSettings(false)
        }
      }
    }
    void load()
    return () => controller.abort()
  }, [apiToken, isNewDevice, savedId, reload])

  useEffect(() => {
    if (!hasChanges) {
      return
    }
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener("beforeunload", warn)
    return () =>
      window.removeEventListener("beforeunload", warn)
  }, [hasChanges])

  const updateDevice = useCallback(
    (updates: Partial<Device>) => {
      setSelectedDevice((current) =>
        current ? { ...current, ...updates } : null,
      )
    },
    [],
  )
  const updateSettings = useCallback(
    (updates: AutomationSettings) => {
      setAutomationSettings((current) => ({
        ...current,
        ...updates,
      }))
    },
    [],
  )
  const selectDevice = (device: Device | null) => {
    if (
      hasChanges &&
      !confirm(
        "Discard the unsaved changes for this device?",
      )
    ) {
      return
    }
    setMessage("")
    setIsDeviceListOpen(false)
    navigate(
      device
        ? `/devices/${section}?device=${encodeURIComponent(device.id)}`
        : "/devices/device?new=1",
    )
  }
  const saveSettings = async () => {
    if (
      !savedDevice ||
      isNewDevice ||
      isBusy ||
      pendingSettings.length === 0 ||
      hasRestartPending ||
      hasSettingsError
    ) {
      return
    }
    setIsSavingAutomation(true)
    try {
      const response = await fetch(
        `/api/manage/devices/${encodeURIComponent(savedDevice.id)}/settings`,
        {
          body: JSON.stringify({
            settings: pendingSettings,
          }),
          headers: getRequestHeaders(apiToken),
          method: "PUT",
        },
      )
      if (!response.ok) {
        throw new Error(
          "Could not save settings. Your edits are still here.",
        )
      }
      setSavedSettings(automationSettings)
      setPreviewRevision((current) => current + 1)
      setMessage("Settings saved.")
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not save settings.",
      )
    } finally {
      setIsSavingAutomation(false)
    }
  }
  const saveDevice = async () => {
    if (
      !selectedDevice ||
      isBusy ||
      pendingSettings.length > 0 ||
      !hasDeviceChanges ||
      hasRestartPending
    ) {
      return
    }
    if (
      !/^[a-z0-9][a-z0-9-]*$/.test(selectedDevice.id) ||
      !selectedDevice.label.trim() ||
      !Number.isInteger(selectedDevice.width) ||
      selectedDevice.width < 1 ||
      !Number.isInteger(selectedDevice.height) ||
      selectedDevice.height < 1
    ) {
      setMessage(
        "Enter a name, a valid device ID, and positive whole-number dimensions.",
      )
      return
    }
    setIsSaving(true)
    try {
      const response = await fetch(
        isNewDevice
          ? "/api/manage/devices"
          : `/api/manage/devices/${encodeURIComponent(selectedDevice.id)}`,
        {
          body: JSON.stringify(selectedDevice),
          headers: getRequestHeaders(apiToken),
          method: isNewDevice ? "POST" : "PUT",
        },
      )
      const body = (await response
        .json()
        .catch(() => ({}))) as { error?: string }
      if (!response.ok) {
        throw new Error(
          body.error ??
            "Could not save the device. Your edits are still here.",
        )
      }
      setHasRestartPending(true)
      setMessage(
        "Device saved. CastKit is restarting. Reload devices when it is ready.",
      )
      setDevices((current) =>
        isNewDevice
          ? current.concat(selectedDevice)
          : current.map((device) =>
              device.id === selectedDevice.id
                ? selectedDevice
                : device,
            ),
      )
      navigate(
        `/devices/${section}?device=${encodeURIComponent(selectedDevice.id)}`,
        { replace: true },
      )
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not save the device.",
      )
    } finally {
      setIsSaving(false)
    }
  }
  const deleteDevice = async () => {
    if (
      !savedDevice ||
      !confirm(`Delete ${savedDevice.label}?`)
    ) {
      return
    }
    setIsSaving(true)
    try {
      const response = await fetch(
        `/api/manage/devices/${encodeURIComponent(savedDevice.id)}`,
        {
          headers: getRequestHeaders(apiToken),
          method: "DELETE",
        },
      )
      if (!response.ok) {
        throw new Error("Could not delete the device.")
      }
      setDevices((current) =>
        current.filter(
          (device) => device.id !== savedDevice.id,
        ),
      )
      navigate("/devices/device", { replace: true })
      setHasRestartPending(true)
      setMessage("Device deleted. CastKit is restarting.")
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not delete the device.",
      )
    } finally {
      setIsSaving(false)
    }
  }
  const query = isNewDevice
    ? "?new=1"
    : savedId
      ? `?device=${encodeURIComponent(savedId)}`
      : ""

  return (
    <div
      className="device-manager"
      data-overview={isOverview}
    >
      {!isOverview ? (
        <div className="device-toolbar">
          <Button
            appearance="outline"
            onClick={() =>
              navigate(
                `${isOverview ? "/devices/device" : "/all-screens"}${query}`,
              )
            }
          >
            {isOverview ? "Device settings" : "All screens"}
          </Button>
          <Button
            aria-controls="management-devices"
            aria-expanded={isDeviceListOpen}
            className="device-list-toggle"
            isDisabled={isOverview}
            appearance="outline"
            onClick={() =>
              setIsDeviceListOpen((isOpen) => !isOpen)
            }
          >
            Devices
          </Button>
          <Button
            appearance="outline"
            isDisabled={isBusy}
            onClick={() => selectDevice(null)}
          >
            Add device
          </Button>
        </div>
      ) : null}
      {!isOverview ? (
        <aside
          className="management-rail"
          data-is-expanded={isDeviceListOpen}
          id="management-devices"
          aria-label="Devices"
        >
          <div className="rail-heading">
            <h2>Devices</h2>
            <span>{devices.length}</span>
          </div>
          <Field label="Find a device">
            <input
              className="setting-input"
              onChange={(event) =>
                setSearch(event.target.value)
              }
              type="search"
              value={search}
            />
          </Field>
          <div className="device-list">
            {devices
              .filter((device) =>
                device.label
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((device) => (
                <button
                  aria-pressed={
                    !isNewDevice && savedId === device.id
                  }
                  className="device-list-item"
                  disabled={
                    isBusy ||
                    (!isNewDevice && savedId === device.id)
                  }
                  key={device.id}
                  onClick={() => selectDevice(device)}
                  type="button"
                >
                  <strong>{device.label}</strong>
                  <span>
                    {device.renderer === "browser"
                      ? "Browser"
                      : "Image"}{" "}
                    · {device.width} × {device.height}
                  </span>
                </button>
              ))}
            {!isLoading &&
            devices.length > 0 &&
            !devices.some((device) =>
              device.label
                .toLowerCase()
                .includes(search.toLowerCase()),
            ) ? (
              <p>No devices match this search.</p>
            ) : null}
          </div>
          <Button
            appearance="ghost"
            isDisabled={isBusy || isLoading}
            onClick={() => {
              if (
                !hasChanges ||
                confirm(
                  "Discard unsaved changes and reload devices?",
                )
              ) {
                setReload((current) => current + 1)
              }
            }}
          >
            Reload devices
          </Button>
        </aside>
      ) : null}
      <div className="management-main">
        {isOverview ? (
          <>
            <div className="device-heading">
              <div>
                <h1>All screens</h1>
                <p className="text-content-secondary text-sm">
                  Upright previews of every display. Browser
                  views update automatically; refresh to
                  load new images.
                </p>
              </div>
              <div className="save-buttons">
                <Button
                  appearance="outline"
                  onClick={() =>
                    navigate(`/devices/device${query}`)
                  }
                >
                  Device settings
                </Button>
                <Button
                  appearance="outline"
                  onClick={() =>
                    setPreviewRevision(
                      (current) => current + 1,
                    )
                  }
                >
                  Refresh all
                </Button>
              </div>
            </div>
            <p className="text-content-secondary text-xs">
              These previews show CastKit output, not the
              physical screens.
            </p>
            {isLoading ? (
              <p>Load in progress…</p>
            ) : devices.length === 0 &&
              platform.screens.length === 0 ? (
              <Card heading="No displays">
                <p>Add a device, or connect below.</p>
              </Card>
            ) : (
              <AdaptiveGrid
                className="screens-grid"
                itemBlockSize={420}
                chromeBlockSize={230}
                minColumnInlineSize={320}
                maxColumns={4}
              >
                {devices.map((device) => (
                  <DevicePreview
                    key={device.id}
                    apiToken={apiToken}
                    device={device}
                    revision={previewRevision}
                    isOverview
                    onEdit={() => selectDevice(device)}
                  />
                ))}
                {platform.screens
                  .filter(
                    (screen) =>
                      !Object.values(
                        platform.deviceScreens,
                      ).includes(screen.id),
                  )
                  .map((screen) => (
                    <DevicePreview
                      key={`screen:${screen.id}`}
                      apiToken={apiToken}
                      device={{
                        id: `screen:${screen.id}`,
                        label: screen.name,
                        mac: "",
                        width: 1280,
                        height: 720,
                        renderer: "browser",
                        rotation: 0,
                      }}
                      revision={previewRevision}
                      isOverview
                      previewUrl={`/screen/${encodeURIComponent(screen.id)}?preview=1`}
                      onEdit={() => navigate("/screens")}
                    />
                  ))}
              </AdaptiveGrid>
            )}
          </>
        ) : selectedDevice ? (
          <>
            <div className="device-heading">
              <div>
                <p className="text-content-secondary text-sm">
                  Device settings
                </p>
                <h1>
                  {isNewDevice
                    ? "New device"
                    : selectedDevice.label}
                </h1>
                <p className="text-content-secondary text-sm">
                  {isBrowser ? "Browser" : "Image"} ·{" "}
                  {selectedDevice.width} ×{" "}
                  {selectedDevice.height}
                  {savedId ? ` · ${savedId}` : ""}
                </p>
              </div>
              {!isNewDevice ? (
                <Button
                  appearance="outline"
                  intent="danger"
                  isDisabled={isBusy}
                  onClick={() => void deleteDevice()}
                >
                  Delete device
                </Button>
              ) : null}
            </div>
            <Tabs
              activeHref={`/devices/${section}`}
              className="settings-tabs"
              label="Device settings"
              tabs={sections
                .filter(
                  (name) =>
                    !isNewDevice ||
                    name === "device" ||
                    name === "views",
                )
                .map((name) => ({
                  href: `/devices/${name}${query}`,
                  label:
                    name[0]?.toUpperCase() + name.slice(1),
                }))}
            />
            <div className="settings-layout">
              <form
                className="settings-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (
                    section === "device" ||
                    section === "views"
                  ) {
                    void saveDevice()
                  } else {
                    void saveSettings()
                  }
                }}
              >
                <fieldset
                  disabled={
                    isBusy || isLoading || hasRestartPending
                  }
                >
                  {section === "device" ? (
                    <>
                      <DeviceFields
                        device={selectedDevice}
                        isNewDevice={isNewDevice}
                        onChange={updateDevice}
                      />
                      {!isNewDevice ? (
                        <Card
                          className="assigned-screen"
                          heading="Assigned screen"
                        >
                          <div className="setting-fields">
                            <SettingField
                              label="Screen"
                              value={screenId}
                              onChange={setScreenId}
                              width="wide"
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
                            />
                            <Button
                              appearance="outline"
                              isDisabled={
                                isBusy ||
                                screenId ===
                                  assignedScreenId
                              }
                              onClick={() =>
                                void saveScreen()
                              }
                            >
                              Assign screen
                            </Button>
                          </div>
                        </Card>
                      ) : null}
                    </>
                  ) : isLoadingSettings ? (
                    <p>Load in progress…</p>
                  ) : hasSettingsError ? (
                    <Card heading="Settings unavailable">
                      <p>
                        Reload devices to try again. Your
                        device definition is still
                        available.
                      </p>
                    </Card>
                  ) : (
                    <DeviceSettingsFields
                      device={selectedDevice}
                      onChange={updateSettings}
                      onDeviceChange={updateDevice}
                      section={section}
                      settings={automationSettings}
                    />
                  )}
                </fieldset>
                <div className="settings-savebar">
                  <div>
                    <strong>
                      {hasChanges
                        ? "Unsaved changes"
                        : "No unsaved changes"}
                    </strong>
                    <p>
                      {pendingSettings.length > 0 &&
                      hasDeviceChanges
                        ? "Save the settings before the device restart."
                        : hasDeviceChanges
                          ? "Device changes restart CastKit."
                          : "Setting changes apply without a restart."}
                    </p>
                  </div>
                  <div className="save-buttons">
                    {(!isBrowser ||
                      selectedDevice.hasMqttBacklight ||
                      pendingSettings.length > 0) &&
                    !isNewDevice ? (
                      <Button
                        appearance="outline"
                        isDisabled={
                          isBusy ||
                          isLoadingSettings ||
                          hasSettingsError ||
                          pendingSettings.length === 0 ||
                          hasRestartPending
                        }
                        isLoading={isSavingAutomation}
                        onClick={() => void saveSettings()}
                        type="button"
                      >
                        Save settings
                      </Button>
                    ) : null}
                    <Button
                      isDisabled={
                        isBusy ||
                        !hasDeviceChanges ||
                        pendingSettings.length > 0 ||
                        hasRestartPending
                      }
                      isLoading={isSaving}
                      onClick={() => void saveDevice()}
                      type="button"
                    >
                      {isNewDevice
                        ? "Create device"
                        : "Save device & restart"}
                    </Button>
                  </div>
                </div>
              </form>
              <DevicePreview
                apiToken={apiToken}
                device={
                  isNewDevice ? null : (savedDevice ?? null)
                }
                revision={previewRevision}
              />
            </div>
          </>
        ) : (
          <Card
            heading={
              isLoading
                ? "Load in progress…"
                : "No device selected"
            }
          >
            <p>Select a device, or add a new one.</p>
          </Card>
        )}
        <p
          aria-label="Management status"
          className="management-status"
          role="status"
        >
          {message}
        </p>
        <details
          className="management-auth"
          open={devices.length === 0 || undefined}
        >
          <summary>Connection & authentication</summary>
          <div className="setting-fields">
            <SettingField
              description="Stored only in this browser session. Leave blank when the API is open on your local network."
              label="API token"
              onChange={setTokenInput}
              type="password"
              value={tokenInput}
              width="wide"
            />
            <Button
              isDisabled={isBusy}
              onClick={() => {
                sessionStorage.setItem(
                  "castkit-api-token",
                  tokenInput,
                )
                setApiToken(tokenInput)
                setReload((current) => current + 1)
              }}
            >
              Connect
            </Button>
          </div>
        </details>
      </div>
    </div>
  )
}
