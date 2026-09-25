import {
  Button,
  Card,
  Checkbox,
  Field,
  Picker,
} from "@charcuterie/ui"
import { useState } from "react"
import {
  inputClass,
  mutate,
  type Platform,
  type Screen,
} from "./platformApi.ts"
import { AccessFields } from "./ViewEditor.tsx"

export const ScreenEditor = ({
  value,
  onChange,
  platform,
  pin,
  onPinChange,
  onRefresh,
}: {
  value: Screen
  onChange: (value: Screen) => void
  platform: Platform
  pin: string
  onPinChange: (value: string) => void
  onRefresh: () => Promise<void>
}) => {
  const [selected, setSelected] = useState(
    value.activeViewId ?? value.defaultViewId,
  )
  const [duration, setDuration] = useState("")
  const [priority, setPriority] = useState(0)
  const [message, setMessage] = useState("")
  const [isBusy, setIsBusy] = useState(false)
  const saved = platform.screens.find(
    (item) => item.id === value.id,
  )
  const select = async () => {
    setIsBusy(true)
    try {
      await mutate(
        `/api/manage/platform/screens/${encodeURIComponent(value.id)}/select`,
        {
          viewId: selected,
          priority,
          ...(duration
            ? { durationSeconds: Number(duration) }
            : {}),
        },
      )
      setMessage(
        duration
          ? "Temporary view selected. The screen will restore its prior selection when the override expires."
          : "View selected.",
      )
      await onRefresh()
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not select view.",
      )
    } finally {
      setIsBusy(false)
    }
  }
  return (
    <>
      <Field
        label="Default view"
        description="Used when this screen has no active selection."
      >
        <Picker
          label="Default view"
          value={value.defaultViewId}
          options={platform.views.map((view) => ({
            label: view.name,
            value: view.id,
          }))}
          onChange={(defaultViewId) =>
            onChange({
              ...value,
              defaultViewId,
              viewIds: [
                ...new Set([
                  ...value.viewIds,
                  defaultViewId,
                ]),
              ],
            })
          }
        />
      </Field>
      <Card heading="Allowed views">
        <div className="grid gap-3">
          {platform.views.map((view) => (
            <Checkbox
              key={`${view.id}:${value.defaultViewId}`}
              label={view.name}
              isReadOnly={view.id === value.defaultViewId}
              isChecked={value.viewIds.includes(view.id)}
              onChange={(isChecked) => {
                if (
                  !isChecked &&
                  view.id === value.defaultViewId
                ) {
                  setMessage(
                    "Choose another default view before removing this one.",
                  )
                  return
                }
                onChange({
                  ...value,
                  viewIds: isChecked
                    ? [...value.viewIds, view.id]
                    : value.viewIds.filter(
                        (id) => id !== view.id,
                      ),
                })
              }}
            />
          ))}
          {!platform.views.length ? (
            <p>Create a saved view first.</p>
          ) : null}
        </div>
      </Card>
      <AccessFields
        value={value}
        onChange={(next) => onChange({ ...value, ...next })}
        pin={pin}
        onPinChange={onPinChange}
      />
      {saved ? (
        <Card heading="Change the active view">
          <div className="grid gap-4">
            <p className="text-content-secondary">
              Current:{" "}
              {platform.views.find(
                (view) =>
                  view.id ===
                  (saved.activeViewId ??
                    saved.defaultViewId),
              )?.name ?? "None"}
              . Save allowed view changes before selecting a
              view.
            </p>
            <Field label="Show view">
              <Picker
                label="Show view"
                value={selected}
                options={platform.views
                  .filter((view) =>
                    saved.viewIds.includes(view.id),
                  )
                  .map((view) => ({
                    label: view.name,
                    value: view.id,
                  }))}
                onChange={setSelected}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Duration (seconds)"
                description="Leave blank for a lasting selection."
              >
                <input
                  className={inputClass}
                  type="number"
                  min={1}
                  value={duration}
                  onChange={(event) =>
                    setDuration(event.target.value)
                  }
                />
              </Field>
              <Field
                label="Priority"
                description="Higher priorities take precedence over lower ones."
              >
                <input
                  className={inputClass}
                  type="number"
                  min={0}
                  value={priority}
                  onChange={(event) =>
                    setPriority(Number(event.target.value))
                  }
                />
              </Field>
            </div>
            <Button
              type="button"
              isLoading={isBusy}
              onClick={() => void select()}
            >
              Show on screen
            </Button>
          </div>
        </Card>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </>
  )
}
