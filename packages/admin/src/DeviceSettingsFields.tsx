import {
  AdaptiveGrid,
  Card,
  Checkbox,
} from "@charcuterie/ui"
import type {
  AutomationSettings,
  Device,
} from "./device.ts"
import {
  COLOR_MODE_OPTIONS,
  DATE_STYLE_OPTIONS,
  DITHER_OPTIONS,
  PHOTO_FORMAT_OPTIONS,
  ROTATION_OPTIONS,
  SHAPE_OPTIONS,
  TIME_FORMAT_OPTIONS,
} from "./deviceOptions.ts"
import { SettingField } from "./SettingField.tsx"

/** Only the chosen category is mounted; drafts are owned above the tabs. */
export const DeviceSettingsFields = ({
  device,
  section,
  settings,
  onChange,
  onDeviceChange,
}: {
  device: Device
  section: string
  settings: AutomationSettings
  onChange: (updates: AutomationSettings) => void
  onDeviceChange: (updates: Partial<Device>) => void
}) => {
  const field = ({
    label,
    kind,
    type = "text",
    width = "medium",
    options,
  }: {
    label: string
    kind: string
    type?: "text" | "number"
    width?: "short" | "medium" | "wide"
    options?: readonly { label: string; value: string }[]
  }) => (
    <SettingField
      key={kind}
      label={label}
      onChange={(value) => onChange({ [kind]: value })}
      options={options}
      type={type}
      value={
        options?.find(
          (option) =>
            option.value.toLowerCase() ===
            settings[kind]?.toLowerCase(),
        )?.value ??
        settings[kind] ??
        ""
      }
      width={width}
    />
  )

  if (section === "photos") {
    return (
      <AdaptiveGrid
        chromeBlockSize={350}
        itemBlockSize={310}
        maxColumns={2}
        minColumnInlineSize={320}
      >
        <Card heading="Photo selection">
          <div className="setting-fields">
            {field({
              label: "Photo people",
              kind: "photoPeople",
              width: "wide",
            })}
            {field({
              label: "Photo query",
              kind: "photoQuery",
              width: "wide",
            })}
            {field({
              label: "People minimum",
              kind: "photoPeopleMinimum",
              type: "number",
              width: "short",
            })}
            {field({
              label: "Recency (days)",
              kind: "photoRecency",
              type: "number",
              width: "short",
            })}
          </div>
        </Card>
        <Card heading="Timing & format">
          <div className="setting-fields">
            {field({
              label: "Interval (minutes)",
              kind: "photoInterval",
              type: "number",
              width: "short",
            })}
            {field({
              label: "Photo quality",
              kind: "photoQuality",
              type: "number",
              width: "short",
            })}
            {field({
              label: "Photo format",
              kind: "photoFormat",
              options: PHOTO_FORMAT_OPTIONS,
            })}
          </div>
        </Card>
      </AdaptiveGrid>
    )
  }
  if (section === "clock") {
    return (
      <Card heading="Clock">
        <div className="setting-fields">
          {field({
            label: "Timezone",
            kind: "clockTimezone",
            width: "wide",
          })}
          {field({
            label: "Time format",
            kind: "clockTimeFormat",
            options: TIME_FORMAT_OPTIONS,
          })}
          {field({
            label: "Date style",
            kind: "clockDateStyle",
            options: DATE_STYLE_OPTIONS,
          })}
        </div>
      </Card>
    )
  }
  if (section === "image") {
    return (
      <AdaptiveGrid
        chromeBlockSize={350}
        itemBlockSize={310}
        maxColumns={2}
        minColumnInlineSize={320}
      >
        <Card heading="Image adjustments">
          <div className="setting-fields">
            {field({
              label: "Brightness (%)",
              kind: "brightness",
              type: "number",
              width: "short",
            })}
            {field({
              label: "Saturation (%)",
              kind: "saturation",
              type: "number",
              width: "short",
            })}
            {field({
              label: "Dither",
              kind: "dither",
              options: DITHER_OPTIONS,
            })}
            {field({
              label: "Display rotation",
              kind: "rotation",
              options: ROTATION_OPTIONS,
            })}
            {device.colorMode === "spectra6"
              ? field({
                  label: "Photo color",
                  kind: "colorMode",
                  options: COLOR_MODE_OPTIONS,
                })
              : null}
          </div>
        </Card>
        <Card heading="Margins & crop">
          <p className="text-content-secondary text-sm">
            All values are in pixels.
          </p>
          <div className="edge-fields">
            {[
              { prefix: "margin", label: "Margin" },
              { prefix: "photo_crop", label: "Photo crop" },
            ].flatMap(({ prefix, label }) =>
              ["top", "right", "bottom", "left"].map(
                (edge) =>
                  field({
                    label: `${label} ${edge}`,
                    kind: `${prefix}_${edge}`,
                    type: "number",
                    width: "short",
                  }),
              ),
            )}
          </div>
        </Card>
      </AdaptiveGrid>
    )
  }
  if (section === "views") {
    return (
      <Card heading="Views & interaction">
        <div className="setting-fields">
          <SettingField
            label="Shape"
            onChange={(shape) =>
              onDeviceChange({
                shape: shape as Device["shape"],
              })
            }
            options={SHAPE_OPTIONS}
            value={device.shape ?? "rectangle"}
          />
          <SettingField
            description="Comma-separated names, in selector order. Leave blank to offer every compatible view."
            label="Views"
            onChange={(value) =>
              onDeviceChange({
                views: value.trim()
                  ? value
                      .split(",")
                      .map((name) => name.trim())
                      .filter(Boolean)
                  : undefined,
              })
            }
            value={device.views?.join(", ") ?? ""}
            width="wide"
          />
        </div>
        <Checkbox
          isChecked={device.hasTouch ?? false}
          key={`${device.id}-touch`}
          label="Touch enabled"
          onChange={(hasTouch) =>
            onDeviceChange({ hasTouch })
          }
        />
        <Checkbox
          isChecked={device.hasViewDrawer ?? false}
          key={`${device.id}-drawer`}
          label="Show edge view drawer"
          onChange={(hasViewDrawer) =>
            onDeviceChange({ hasViewDrawer })
          }
        />
      </Card>
    )
  }
  return (
    <Card heading="Updates">
      {device.renderer === "browser" ? (
        <div className="setting-fields">
          {field({
            label: "Backlight (%)",
            kind: "backlightLevel",
            type: "number",
            width: "short",
          })}
        </div>
      ) : (
        <Checkbox
          isChecked={settings.updates !== "OFF"}
          key={`${device.id}-updates`}
          label="Accept updates"
          onChange={(isEnabled) =>
            onChange({ updates: isEnabled ? "ON" : "OFF" })
          }
        />
      )}
      <p className="text-content-secondary text-sm">
        These settings also appear in Home Assistant. Saved
        changes apply without a restart.
      </p>
    </Card>
  )
}
