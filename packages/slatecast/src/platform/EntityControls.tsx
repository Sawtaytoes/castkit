import type { ContractData } from "@castkit/sdk/contracts"
import { useState } from "preact/hooks"

type Entity =
  ContractData["entities.v1"]["entities"][number]
const parameterActions = [
  "set_temperature",
  "set_percentage",
  "set_cover_position",
  "volume_set",
  "volume_mute",
  "set_value",
  "select_option",
  "set_hvac_mode",
  "set_fan_mode",
]
/** Forms supply the typed parameters required by controls instead of sending empty services. */
export const EntityControls = ({
  entity,
  request,
}: {
  entity: Entity
  request: (request: {
    action: string
    payload?: Record<string, unknown>
  }) => void
}) => {
  const [draftValue, setDraftValue] = useState(entity.state)
  const [duration, setDuration] = useState(5)
  const numberControl = ({
    action,
    label,
    attribute,
    parameter,
    minimum = 0,
    maximum = 100,
    step = 1,
  }: {
    action: string
    label: string
    attribute: string
    parameter: string
    minimum?: number
    maximum?: number
    step?: number
  }) =>
    entity.actions.includes(action) ? (
      <label>
        {label}
        <input
          type="number"
          min={minimum}
          max={maximum}
          step={step}
          value={Number(
            entity.attributes[attribute] ?? minimum,
          )}
          onChange={(event) => {
            if (event.currentTarget.validity.valid) {
              request({
                action,
                payload: {
                  [parameter]: Number(
                    event.currentTarget.value,
                  ),
                },
              })
            }
          }}
        />
      </label>
    ) : null
  const choiceControl = ({
    action,
    label,
    attribute,
    optionsAttribute,
    parameter,
  }: {
    action: string
    label: string
    attribute?: string
    optionsAttribute: string
    parameter: string
  }) =>
    entity.actions.includes(action) &&
    Array.isArray(entity.attributes[optionsAttribute]) ? (
      <label>
        {label}
        <select
          value={
            attribute
              ? String(entity.attributes[attribute] ?? "")
              : entity.state
          }
          onChange={(event) =>
            request({
              action,
              payload: {
                [parameter]: event.currentTarget.value,
              },
            })
          }
        >
          {(
            entity.attributes[optionsAttribute] as unknown[]
          )
            .filter(
              (option): option is string =>
                typeof option === "string",
            )
            .map((option) => (
              <option value={option} key={option}>
                {option}
              </option>
            ))}
        </select>
      </label>
    ) : null
  return (
    <div class="platform-actions">
      {entity.domain === "timer" ? (
        <label>
          Minutes
          <input
            type="number"
            min={1}
            max={10080}
            value={duration}
            onInput={(event) =>
              setDuration(Number(event.currentTarget.value))
            }
          />
        </label>
      ) : null}
      {entity.actions
        .filter(
          (action) => !parameterActions.includes(action),
        )
        .map((action) => (
          <button
            type="button"
            key={action}
            data-castkit-target={`entity:${entity.id}:${entity.state}:${action}`}
            disabled={
              entity.domain === "timer" &&
              ((action === "pause" &&
                entity.state !== "active") ||
                (action === "cancel" &&
                  entity.state === "idle") ||
                (action === "start" &&
                  (!Number.isFinite(duration) ||
                    duration < 1)))
            }
            onClick={() =>
              request({
                action,
                ...(entity.domain === "timer" &&
                action === "start"
                  ? {
                      payload:
                        entity.state === "paused"
                          ? {}
                          : {
                              duration: Math.round(
                                duration * 60,
                              ),
                            },
                    }
                  : {}),
              })
            }
          >
            {entity.domain === "timer" &&
            action === "start" &&
            entity.state === "paused"
              ? "Resume"
              : action
                  .replaceAll("_", " ")
                  .replace(/^./, (letter) =>
                    letter.toUpperCase(),
                  )}
          </button>
        ))}
      {numberControl({
        action: "set_temperature",
        label: "Temperature",
        attribute: "temperature",
        parameter: "temperature",
        minimum: Number(entity.attributes.min_temp ?? 5),
        maximum: Number(entity.attributes.max_temp ?? 35),
        step: 0.5,
      })}
      {numberControl({
        action: "set_percentage",
        label: "Fan speed",
        attribute: "percentage",
        parameter: "percentage",
      })}
      {numberControl({
        action: "set_cover_position",
        label: "Position",
        attribute: "current_position",
        parameter: "position",
      })}
      {numberControl({
        action: "volume_set",
        label: "Volume",
        attribute: "volume_level",
        parameter: "volume_level",
        maximum: 1,
        step: 0.05,
      })}
      {entity.actions.includes("volume_mute") ? (
        <button
          type="button"
          onClick={() =>
            request({
              action: "volume_mute",
              payload: {
                is_volume_muted:
                  entity.attributes.is_volume_muted !==
                  true,
              },
            })
          }
        >
          {entity.attributes.is_volume_muted
            ? "Unmute"
            : "Mute"}
        </button>
      ) : null}
      {entity.domain === "light" &&
      entity.actions.includes("turn_on") ? (
        <label>
          Brightness
          <input
            type="range"
            min={1}
            max={255}
            value={Number(
              entity.attributes.brightness ?? 255,
            )}
            onChange={(event) =>
              request({
                action: "turn_on",
                payload: {
                  brightness: Number(
                    event.currentTarget.value,
                  ),
                },
              })
            }
          />
        </label>
      ) : null}
      {choiceControl({
        action: "select_option",
        label: "Selection",
        optionsAttribute: "options",
        parameter: "option",
      })}
      {choiceControl({
        action: "set_hvac_mode",
        label: "Mode",
        optionsAttribute: "hvac_modes",
        parameter: "hvac_mode",
      })}
      {choiceControl({
        action: "set_fan_mode",
        label: "Fan mode",
        attribute: "fan_mode",
        optionsAttribute: "fan_modes",
        parameter: "fan_mode",
      })}
      {entity.actions.includes("set_value") ? (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            request({
              action: "set_value",
              payload: {
                value:
                  entity.domain === "input_text"
                    ? draftValue
                    : Number(draftValue),
              },
            })
          }}
        >
          <label>
            {entity.name}
            <input
              type={
                entity.domain === "input_text"
                  ? "text"
                  : "number"
              }
              value={draftValue}
              min={Number(entity.attributes.min ?? 0)}
              max={Number(entity.attributes.max ?? 100)}
              step={Number(entity.attributes.step ?? 1)}
              maxLength={255}
              onInput={(event) =>
                setDraftValue(event.currentTarget.value)
              }
            />
          </label>
          <button type="submit">Save</button>
        </form>
      ) : null}
    </div>
  )
}
