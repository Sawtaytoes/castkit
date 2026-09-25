import { AdaptiveGrid, Card } from "@charcuterie/ui"
import type { Device } from "./device.ts"
import {
  BROWSER_COLOR_OPTIONS,
  IMAGE_COLOR_OPTIONS,
  ROTATION_OPTIONS,
} from "./deviceOptions.ts"
import { SettingField } from "./SettingField.tsx"

/** Device identity and physical setup share a tab, and split only when space permits. */
export const DeviceFields = ({
  device,
  isNewDevice,
  onChange,
}: {
  device: Device
  isNewDevice: boolean
  onChange: (updates: Partial<Device>) => void
}) => (
  <AdaptiveGrid
    chromeBlockSize={350}
    itemBlockSize={370}
    maxColumns={2}
    minColumnInlineSize={320}
  >
    <Card heading="Identity">
      <div className="setting-fields">
        <SettingField
          label="Name"
          onChange={(label) => onChange({ label })}
          value={device.label}
          width="wide"
        />
        <SettingField
          description={
            isNewDevice
              ? "Use lowercase letters, numbers, and hyphens."
              : "This identifier is permanent."
          }
          isReadOnly={!isNewDevice}
          label="Device ID"
          onChange={(id) => onChange({ id })}
          value={device.id}
          width="wide"
        />
        <SettingField
          label="MAC address"
          onChange={(mac) => onChange({ mac })}
          value={device.mac}
          width="wide"
        />
      </div>
    </Card>
    <Card heading="Display">
      <div className="setting-fields">
        <SettingField
          label="Width (px)"
          min={1}
          onChange={(width) =>
            onChange({ width: Number(width) })
          }
          type="number"
          value={String(device.width)}
          width="short"
        />
        <SettingField
          label="Height (px)"
          min={1}
          onChange={(height) =>
            onChange({ height: Number(height) })
          }
          type="number"
          value={String(device.height)}
          width="short"
        />
        <SettingField
          label="Rotation"
          onChange={(rotation) =>
            onChange({
              rotation: Number(
                rotation,
              ) as Device["rotation"],
            })
          }
          options={ROTATION_OPTIONS}
          value={String(device.rotation ?? 0)}
          width="short"
        />
        <SettingField
          label="Renderer"
          onChange={(value) =>
            onChange(
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
            { label: "Browser", value: "browser" },
          ]}
          value={device.renderer ?? "image"}
        />
        <SettingField
          label="Color"
          onChange={(value) =>
            onChange(
              device.renderer === "browser"
                ? { color: value as Device["color"] }
                : {
                    colorMode: value as Device["colorMode"],
                  },
            )
          }
          options={
            device.renderer === "browser"
              ? BROWSER_COLOR_OPTIONS
              : IMAGE_COLOR_OPTIONS
          }
          value={
            device.renderer === "browser"
              ? (device.color ?? "full")
              : (device.colorMode ?? "monochrome")
          }
        />
      </div>
      <p className="text-content-secondary text-sm">
        Save the device to apply these settings. CastKit
        restarts after the save.
      </p>
    </Card>
  </AdaptiveGrid>
)
