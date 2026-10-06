import { AMBIENT_LIGHT_MODES } from "@castkit/sdk/ambientLight"
import {
  Button,
  Card,
  Checkbox,
  Picker,
  Slider,
} from "@charcuterie/ui"
import type {
  AutomationSettings,
  Device,
} from "./device.ts"

const modeLabels = {
  "album-glow": "Album glow",
  "swipe-comet": "Swipe comet",
  "meeting-fuse": "Meeting fuse",
  "weather-aura": "Weather aura",
  "progress-bar": "Progress bar",
}
/** Independent rear LEDs apply immediately, with the same state available to Home Assistant. */
export const AmbientLightControls = ({
  device,
  settings,
  isSaving,
  onApply,
}: {
  device: Device
  settings: AutomationSettings
  isSaving: boolean
  onApply: (updates: AutomationSettings) => Promise<void>
}) => {
  const brightness = Number(
    settings.ambientLightBrightness ?? 5,
  )
  const isOn =
    settings.ambientLightPower === "on" && brightness > 0
  const isDemo = settings.ambientLightDemo === "true"
  return (
    <Card heading="Ambient light">
      <Picker
        label="Effect"
        value={settings.ambientLightMode ?? "album-glow"}
        isDisabled={isSaving}
        options={AMBIENT_LIGHT_MODES.map((mode) => ({
          value: mode,
          label: modeLabels[mode],
        }))}
        onChange={(mode) =>
          void onApply({ ambientLightMode: mode })
        }
      />
      <Slider
        isDisabled={isSaving}
        isLabelVisible
        isValueShown
        label="Ambient brightness"
        max={100}
        min={0}
        size="lg"
        value={brightness}
        valueFormat={(value) => `${value}%`}
        onChangeEnd={(value) =>
          void onApply({
            ambientLightBrightness: String(value),
          })
        }
      />
      <div className="save-buttons">
        <Button
          type="button"
          aria-pressed={isOn}
          isDisabled={isSaving}
          onClick={() =>
            void onApply({ ambientLightPower: "on" })
          }
        >
          On
        </Button>
        <Button
          type="button"
          aria-pressed={!isOn}
          appearance="outline"
          isDisabled={isSaving}
          onClick={() =>
            void onApply({ ambientLightPower: "off" })
          }
        >
          Off
        </Button>
      </div>
      <p
        role="status"
        className="text-content-secondary text-sm"
      >
        {isSaving
          ? "Applying ambient light…"
          : isOn
            ? `Ambient light on · ${brightness}%`
            : "Ambient light off"}
      </p>
      <Checkbox
        key={`${device.id}:${isDemo}`}
        isChecked={isDemo}
        isDisabled={isSaving}
        label="Demo preview"
        onChange={(isDemoEnabled) =>
          void onApply({
            ambientLightDemo: String(isDemoEnabled),
          })
        }
      />
      <p className="text-content-secondary text-sm">
        Demo preview uses sample progress, weather and event
        timing to try each effect. Turn it off to use
        current display data.
      </p>
      <p className="text-content-secondary text-sm">
        Changes apply immediately. Home Assistant can
        control the same ambient light. These LEDs are
        independent of the screen backlight.
      </p>
    </Card>
  )
}
