import type { ContractData } from "@castkit/sdk/contracts"
import { useState } from "preact/hooks"
import { EntitiesView } from "./EntitiesView.tsx"

type Entities = ContractData["entities.v1"]

/** Timer creation and announcement use configured scripts from the bound source only. */
export const TimersView = ({
  data,
  now,
  settings,
  isControlEnabled,
  onAction,
}: {
  data: Entities
  now: number
  settings: Record<string, unknown>
  isControlEnabled: boolean
  onAction: (
    action: string,
    payload?: Record<string, unknown>,
  ) => Promise<void>
}) => {
  const [name, setName] = useState("")
  const [minutes, setMinutes] = useState(5)
  const [message, setMessage] = useState("")
  const createScript = data.entities.find(
    (entity) =>
      entity.id === settings.createScriptId &&
      entity.domain === "script" &&
      entity.actions.includes("turn_on"),
  )
  const announceScript = data.entities.find(
    (entity) =>
      entity.id === settings.announceScriptId &&
      entity.domain === "script" &&
      entity.actions.includes("turn_on"),
  )
  const field = ({
    key,
    fallback,
  }: {
    key: string
    fallback: string
  }) =>
    typeof settings[key] === "string" && settings[key]
      ? (settings[key] as string)
      : fallback
  const timers = data.entities.filter(
    (entity) =>
      (entity.domain === "timer" ||
        settings.hasHelperControls === true) &&
      (settings.isActiveOnly !== true ||
        entity.state !== "idle"),
  )
  return (
    <div class="platform-timers">
      {isControlEnabled && createScript ? (
        <form
          class="platform-timer-form"
          onSubmit={(event) => {
            event.preventDefault()
            void onAction("turn_on", {
              entityId: createScript.id,
              variables: {
                [field({
                  key: "createNameField",
                  fallback: "name",
                })]: name,
                [field({
                  key: "createDurationField",
                  fallback: "duration",
                })]: Math.round(minutes * 60),
              },
            })
          }}
        >
          <h2>Create a timer</h2>
          <label>
            Name
            <input
              value={name}
              required
              maxLength={120}
              onInput={(event) =>
                setName(event.currentTarget.value)
              }
            />
          </label>
          <label>
            Minutes
            <input
              type="number"
              min={1}
              max={10080}
              value={minutes}
              onInput={(event) =>
                setMinutes(
                  Number(event.currentTarget.value),
                )
              }
            />
          </label>
          <button
            type="submit"
            disabled={
              !name.trim() ||
              !Number.isFinite(minutes) ||
              minutes < 1
            }
          >
            Create timer
          </button>
        </form>
      ) : null}
      {isControlEnabled && announceScript ? (
        <form
          class="platform-timer-form"
          onSubmit={(event) => {
            event.preventDefault()
            void onAction("turn_on", {
              entityId: announceScript.id,
              variables: {
                [field({
                  key: "announceMessageField",
                  fallback: "message",
                })]: message,
              },
            })
          }}
        >
          <h2>Announce</h2>
          <label>
            Message
            <input
              value={message}
              required
              maxLength={500}
              onInput={(event) =>
                setMessage(event.currentTarget.value)
              }
            />
          </label>
          <button type="submit" disabled={!message.trim()}>
            Announce message
          </button>
        </form>
      ) : null}
      {timers.length > 0 ? (
        <EntitiesView
          data={{ entities: timers }}
          mode="timers"
          settings={settings}
          now={now}
          isControlEnabled={isControlEnabled}
          onAction={onAction}
        />
      ) : (
        <div class="platform-empty">
          <h2>No active timers</h2>
        </div>
      )}
    </div>
  )
}
