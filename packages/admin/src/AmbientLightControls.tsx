import {
  AMBIENT_LIGHT_MODES,
  DEFAULT_AMBIENT_LIGHT_VIEW_MODES,
} from "@castkit/sdk/ambientLight"
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
  off: "Off",
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
    (settings.ambientLightEffectivePower ??
      settings.ambientLightPower) === "on" && brightness > 0
  const isDemo = settings.ambientLightDemo === "true"
  const isFollowing =
    settings.ambientLightFollowView === "true"
  const viewModes: Record<string, string> = JSON.parse(
    settings.ambientLightViewModes ??
      JSON.stringify(DEFAULT_AMBIENT_LIGHT_VIEW_MODES),
  )
  const views: { id: string; name: string }[] = JSON.parse(
    settings.ambientLightViewOptions ?? "[]",
  )
  return (
    <Card heading="Ambient light">
      <span className="text-sm font-medium">
        {isFollowing ? "Manual effect" : "Effect"}
      </span>
      <Picker
        label="Effect"
        value={settings.ambientLightMode ?? "album-glow"}
        isDisabled={isSaving}
        options={AMBIENT_LIGHT_MODES.map((mode) => ({
          value: mode,
          label: modeLabels[mode],
        }))}
        onChange={(mode) =>
          void onApply({
            ambientLightMode: mode,
            ambientLightFollowView: "false",
          })
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
          appearance={isOn ? "solid" : "outline"}
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
          appearance={isOn ? "outline" : "solid"}
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
        key={`${device.id}:follow:${isFollowing}`}
        isChecked={isFollowing}
        isDisabled={isSaving}
        label="Follow current view"
        onChange={(isEnabled) =>
          void onApply({
            ambientLightFollowView: String(isEnabled),
          })
        }
      />
      {isFollowing ? (
        <>
          <p className="text-content-secondary text-sm">
            Current view:{" "}
            {settings.ambientLightEffectiveView ??
              "Unavailable view"}{" "}
            ·{" "}
            {settings.ambientLightEffectiveMode === "off"
              ? "Off for this view"
              : (modeLabels[
                  settings.ambientLightEffectiveMode as keyof typeof modeLabels
                ] ?? "Off for this view")}
            .
            {settings.ambientLightPower === "off"
              ? " Ambient light is manually off."
              : ""}
          </p>
          <div className="setting-fields">
            {views.map((view) => (
              <div key={view.id} className="grid gap-2">
                <span className="text-sm font-medium">
                  {view.name}
                </span>
                <Picker
                  label={`${view.name} effect`}
                  value={viewModes[view.id] ?? "off"}
                  isDisabled={isSaving}
                  options={[
                    ...AMBIENT_LIGHT_MODES,
                    "off",
                  ].map((mode) => ({
                    value: mode,
                    label:
                      modeLabels[
                        mode as keyof typeof modeLabels
                      ],
                  }))}
                  onChange={(mode) =>
                    void onApply({
                      ambientLightViewModes: JSON.stringify(
                        {
                          ...viewModes,
                          [view.id]: mode,
                        },
                      ),
                    })
                  }
                />
              </div>
            ))}
          </div>
          <p className="text-content-secondary text-sm">
            Views without a rule keep the LEDs off. Power,
            brightness and demo preview remain independent.
            Choosing a manual effect stops following views.
          </p>
        </>
      ) : null}
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
