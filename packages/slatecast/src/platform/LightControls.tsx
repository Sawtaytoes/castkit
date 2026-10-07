import type { ContractData } from "@castkit/sdk/contracts"
import { HomePicker } from "./HomePicker.tsx"

type Entity =
  ContractData["entities.v1"]["entities"][number]
const stringValues = (value: unknown) =>
  Array.isArray(value)
    ? value.filter(
        (item): item is string => typeof item === "string",
      )
    : []

/** Light controls expose only reported capabilities and dispatch typed HA parameters. */
export const LightControls = ({
  entity,
  request,
}: {
  entity: Entity
  request: (request: {
    action: string
    payload?: Record<string, unknown>
  }) => void
}) => {
  const modes = stringValues(
    entity.attributes.supported_color_modes,
  )
  const hasBrightness =
    modes.some(
      (mode) => !["onoff", "unknown"].includes(mode),
    ) ||
    typeof entity.attributes.brightness === "number" ||
    typeof entity.attributes.min_color_temp_kelvin ===
      "number"
  const hasColor =
    modes.some((mode) =>
      ["rgb", "rgbw", "rgbww", "hs", "xy"].includes(mode),
    ) ||
    (!modes.length &&
      Array.isArray(entity.attributes.rgb_color))
  const hasTemperature =
    modes.includes("color_temp") ||
    typeof entity.attributes.min_color_temp_kelvin ===
      "number"
  const effects = stringValues(
    entity.attributes.effect_list,
  )
  const rgb = Array.isArray(entity.attributes.rgb_color)
    ? entity.attributes.rgb_color
    : [255, 255, 255]
  const color = `#${rgb
    .slice(0, 3)
    .map((value) =>
      Math.max(
        0,
        Math.min(255, Math.round(Number(value) || 0)),
      )
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`
  const brightness = Math.max(
    1,
    Math.min(
      100,
      Math.round(
        (Number(entity.attributes.brightness ?? 0) / 255) *
          100,
      ),
    ),
  )
  return (
    <div class="home-light-controls">
      {hasBrightness ? (
        <label>
          Brightness{" "}
          <output>
            {entity.state === "off"
              ? "Off"
              : typeof entity.attributes.brightness ===
                  "number"
                ? `${brightness}%`
                : "Unknown"}
          </output>
          <input
            aria-label={`${entity.name} brightness`}
            type="range"
            min={
              entity.actions.includes("turn_off") ? 0 : 1
            }
            max={100}
            value={entity.state === "off" ? 0 : brightness}
            onChange={(event) => {
              const percent = Number(
                event.currentTarget.value,
              )
              request(
                percent === 0
                  ? { action: "turn_off" }
                  : {
                      action: "turn_on",
                      payload: {
                        brightness: Math.round(
                          (percent / 100) * 255,
                        ),
                      },
                    },
              )
            }}
          />
        </label>
      ) : null}
      {hasColor || hasTemperature || effects.length ? (
        <details class="home-light-details">
          <summary>Color & effects</summary>
          {hasColor ? (
            <label>
              Color
              <input
                aria-label={`${entity.name} color`}
                type="color"
                value={color}
                onChange={(event) =>
                  request({
                    action: "turn_on",
                    payload: {
                      rgb_color: [1, 3, 5].map((index) =>
                        Number.parseInt(
                          event.currentTarget.value.slice(
                            index,
                            index + 2,
                          ),
                          16,
                        ),
                      ),
                    },
                  })
                }
              />
            </label>
          ) : null}
          {hasTemperature ? (
            <label>
              White temperature{" "}
              <output>
                {String(
                  entity.attributes.color_temp_kelvin ?? "",
                )}{" "}
                K
              </output>
              <input
                aria-label={`${entity.name} white temperature`}
                type="range"
                min={Number(
                  entity.attributes.min_color_temp_kelvin ??
                    2000,
                )}
                max={Number(
                  entity.attributes.max_color_temp_kelvin ??
                    6500,
                )}
                step={50}
                value={Number(
                  entity.attributes.color_temp_kelvin ??
                    entity.attributes
                      .min_color_temp_kelvin ??
                    2000,
                )}
                onChange={(event) =>
                  request({
                    action: "turn_on",
                    payload: {
                      color_temp_kelvin: Number(
                        event.currentTarget.value,
                      ),
                    },
                  })
                }
              />
            </label>
          ) : null}
          {effects.length ? (
            <HomePicker
              label={`${entity.name} effect`}
              value={String(entity.attributes.effect ?? "")}
              options={effects}
              onChange={(effect) =>
                request({
                  action: "turn_on",
                  payload: { effect },
                })
              }
            />
          ) : null}
        </details>
      ) : null}
    </div>
  )
}
