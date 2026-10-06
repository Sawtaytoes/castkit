import { builtinContractSchemas } from "@castkit/sdk/contracts"
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
import type { Platform } from "./platformApi.ts"

/** One display control surface, regardless of how the panel receives its setting. */
export const BacklightControls = ({
  device,
  settings,
  isSaving,
  onApply,
  channels,
  channelStates,
}: {
  device: Device
  settings: AutomationSettings
  isSaving: boolean
  onApply: (updates: AutomationSettings) => Promise<void>
  channels: Platform["channels"]
  channelStates: Platform["channelStates"]
}) => {
  const level = Number(settings.backlightLevel ?? 100)
  const isOn =
    Number(settings.backlightEffective ?? level) > 0 &&
    settings.backlightPower !== "off"
  const isFollowing =
    settings.backlightPower === "follow-room"
  const roomEntities =
    builtinContractSchemas["entities.v1"].safeParse(
      channelStates[settings.backlightRoomChannel ?? ""]
        ?.data,
    ).data?.entities ?? []
  return (
    <Card heading="Backlight">
      <Slider
        isDisabled={isSaving}
        isLabelVisible
        isValueShown
        label="Brightness"
        max={100}
        min={0}
        onChangeEnd={(value) =>
          void onApply({ backlightLevel: String(value) })
        }
        size="lg"
        value={Number.isFinite(level) ? level : 100}
        valueFormat={(value) => `${value}%`}
      />
      <div className="save-buttons">
        <Button
          aria-pressed={isOn && !isFollowing}
          isDisabled={isSaving}
          onClick={() =>
            void onApply({ backlightPower: "on" })
          }
          type="button"
        >
          On
        </Button>
        <Button
          aria-pressed={!isOn && !isFollowing}
          appearance="outline"
          isDisabled={isSaving}
          onClick={() =>
            void onApply({ backlightPower: "off" })
          }
          type="button"
        >
          Off
        </Button>
      </div>
      <p
        className="text-content-secondary text-sm"
        role="status"
      >
        {isSaving
          ? "Applying backlight…"
          : isOn
            ? `Backlight on · ${settings.backlightEffective ?? settings.backlightLevel ?? "100"}%`
            : "Backlight off"}
      </p>
      <p className="text-content-secondary text-sm">
        Changes apply immediately. Home Assistant can
        control the same backlight.
      </p>
      {device.hasRemoteBacklight ? (
        <details>
          <summary>Room following (optional)</summary>
          <Checkbox
            key={`${device.id}:${isFollowing}`}
            isDisabled={isSaving}
            isChecked={isFollowing}
            label="Follow room lights"
            onChange={(isEnabled) =>
              void onApply({
                backlightPower: isEnabled
                  ? "follow-room"
                  : isOn
                    ? "on"
                    : "off",
              })
            }
          />
          {isFollowing ? (
            <div className="setting-fields">
              <Picker
                label="Room lights channel"
                value={settings.backlightRoomChannel ?? ""}
                onChange={(value) =>
                  void onApply({
                    backlightRoomChannel: value,
                  })
                }
                options={[
                  {
                    label: "Choose a lights channel",
                    value: "",
                  },
                  ...channels
                    .filter(
                      (channel) =>
                        channel.type === "entities.v1",
                    )
                    .map((channel) => ({
                      label: channel.name,
                      value: channel.id,
                    })),
                ]}
              />
              {roomEntities.length ? (
                <Picker
                  label="Room light entity"
                  value={settings.backlightRoomEntity ?? ""}
                  onChange={(value) =>
                    void onApply({
                      backlightRoomEntity: value,
                    })
                  }
                  options={[
                    {
                      label: "Choose a room light",
                      value: "",
                    },
                    ...roomEntities
                      .filter((entity) =>
                        ["light", "switch"].includes(
                          entity.domain,
                        ),
                      )
                      .map((entity) => ({
                        label: entity.name,
                        value: entity.id,
                      })),
                  ]}
                />
              ) : (
                <p className="text-content-secondary text-sm">
                  Room lights are unavailable. The last
                  known power is held; after a restart the
                  backlight remains off until current room
                  state arrives.
                </p>
              )}
              <p className="text-content-secondary text-sm">
                Room state:{" "}
                {settings.backlightRoomStatus ??
                  "unavailable"}
                .
              </p>
            </div>
          ) : null}
          <p className="text-content-secondary text-sm">
            Leave this off when Home Assistant automations
            follow your room lights.
          </p>
        </details>
      ) : null}
    </Card>
  )
}
