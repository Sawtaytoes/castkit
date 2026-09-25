import { Button, Card, Field } from "@charcuterie/ui"
import { useState } from "react"
import {
  inputClass,
  mutate,
  type Platform,
  type Screen,
} from "./platformApi.ts"
import { SearchSelect } from "./SearchSelect.tsx"
import { AccessFields } from "./ViewEditor.tsx"

export const ScreenEditor = ({
  section = "general",
  value,
  onChange,
  platform,
  pin,
  onPinChange,
  onRefresh,
}: {
  section?: string
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
      <div
        hidden={section !== "views"}
        data-editor-section="views"
        className="grid gap-4"
      >
        <Field
          label="Default view"
          description="Used when this screen has no active selection."
        >
          <SearchSelect
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
        <Field
          label="Allowed views"
          description="The default view is always included."
        >
          <SearchSelect
            key={value.defaultViewId}
            label="Allowed views"
            isMultiple
            value={value.viewIds}
            options={platform.views.map((view) => ({
              label: view.name,
              value: view.id,
              textValue: `${view.name} ${(view.tags ?? []).join(" ")}`,
              isDisabled: view.id === value.defaultViewId,
            }))}
            onChange={(id) => {
              if (id !== value.defaultViewId)
                onChange({
                  ...value,
                  viewIds: value.viewIds.includes(id)
                    ? value.viewIds.filter(
                        (item) => item !== id,
                      )
                    : [...value.viewIds, id],
                })
            }}
          />
        </Field>
      </div>
      <div
        hidden={section !== "access"}
        data-editor-section="access"
      >
        <AccessFields
          value={value}
          onChange={(next) =>
            onChange({ ...value, ...next })
          }
          pin={pin}
          onPinChange={onPinChange}
        />
      </div>
      <div
        hidden={section !== "switching"}
        data-editor-section="switching"
      >
        {!saved ? (
          <p>
            Save this screen before switching its active
            view.
          </p>
        ) : null}
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
                . Save allowed view changes before selecting
                a view.
              </p>
              <Field label="Show view">
                <SearchSelect
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
                      setPriority(
                        Number(event.target.value),
                      )
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
      </div>
    </>
  )
}
