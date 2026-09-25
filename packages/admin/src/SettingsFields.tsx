import { Checkbox, Field, Picker } from "@charcuterie/ui"
import { useState } from "react"
import {
  inputClass,
  type SettingField,
  type Settings,
} from "./platformApi.ts"

/** Renders the configuration declared by a CastKit extension. */
export const SettingsFields = ({
  fields,
  values,
  onChange,
  isSecret = false,
  discovery = {},
}: {
  fields: SettingField[]
  values: Settings
  onChange: (value: Settings) => void
  isSecret?: boolean
  discovery?: Record<string, { id: string; name: string }[]>
}) => {
  const [query, setQuery] = useState("")
  return (
    <>
      {fields.map((field) => {
        const value =
          values[field.key] ?? field.defaultValue ?? ""
        const update = (next: unknown) =>
          onChange({ ...values, [field.key]: next })
        if (field.type === "boolean")
          return (
            <Checkbox
              key={field.key}
              label={field.label}
              isChecked={Boolean(value)}
              onChange={update}
            />
          )
        const items = field.discoveryKey
          ? discovery[field.discoveryKey]
          : undefined
        if (items) {
          const selected = Array.isArray(value)
            ? (value as string[])
            : []
          return (
            <div key={field.key} className="grid gap-3">
              {field.type === "string-list" ? (
                <fieldset className="grid gap-3">
                  <legend className="font-medium">
                    {field.label}
                  </legend>
                  <Field
                    label={`Find ${field.label.toLowerCase()}`}
                  >
                    <input
                      className={inputClass}
                      type="search"
                      value={query}
                      onChange={(event) =>
                        setQuery(event.target.value)
                      }
                    />
                  </Field>
                  <div className="grid max-h-64 gap-3 overflow-auto rounded-md border border-border-subtle p-3">
                    {items
                      .filter((item) =>
                        `${item.name} ${item.id}`
                          .toLowerCase()
                          .includes(query.toLowerCase()),
                      )
                      .map((item) => (
                        <Checkbox
                          key={`${item.id}:${selected.includes(item.id)}`}
                          label={`${item.name} (${item.id})`}
                          isChecked={selected.includes(
                            item.id,
                          )}
                          onChange={(isChecked) =>
                            update(
                              isChecked
                                ? [...selected, item.id]
                                : selected.filter(
                                    (id) => id !== item.id,
                                  ),
                            )
                          }
                        />
                      ))}
                    {!items.length ? (
                      <p>No items were found.</p>
                    ) : null}
                  </div>
                  <p className="text-content-secondary text-sm">
                    {selected.length} selected
                  </p>
                </fieldset>
              ) : (
                <Field
                  label={field.label}
                  description={field.description}
                >
                  <Picker
                    label={field.label}
                    value={String(value)}
                    options={[
                      { label: "None", value: "" },
                      ...items.map((item) => ({
                        label: item.name,
                        value: item.id,
                      })),
                    ]}
                    onChange={update}
                  />
                </Field>
              )}
            </div>
          )
        }
        return (
          <Field
            key={field.key}
            label={field.label}
            description={
              isSecret
                ? `${field.description ?? ""} Leave blank to keep the saved credential.`.trim()
                : field.description
            }
            isRequired={!isSecret && field.isRequired}
          >
            {field.key.endsWith("Json") ? (
              <textarea
                className={inputClass}
                rows={6}
                value={
                  typeof value === "string"
                    ? value
                    : JSON.stringify(value, null, 2)
                }
                onChange={(event) =>
                  update(event.target.value)
                }
              />
            ) : field.type === "select" ? (
              <Picker
                label={field.label}
                value={String(value)}
                options={field.options ?? []}
                onChange={update}
              />
            ) : field.type === "string-list" ? (
              <textarea
                className={inputClass}
                rows={5}
                onBlur={(event) =>
                  update(
                    event.target.value
                      .split("\n")
                      .map((value) => value.trim())
                      .filter(Boolean),
                  )
                }
                value={
                  typeof value === "string"
                    ? value
                    : Array.isArray(value)
                      ? value.join("\n")
                      : ""
                }
                onChange={(event) =>
                  update(event.target.value.split("\n"))
                }
              />
            ) : (
              <input
                className={inputClass}
                type={
                  isSecret || field.type === "secret"
                    ? "password"
                    : field.type === "number"
                      ? "number"
                      : "text"
                }
                autoComplete={
                  isSecret ? "new-password" : "off"
                }
                value={String(value)}
                onChange={(event) =>
                  update(
                    field.type === "number" &&
                      event.target.value !== ""
                      ? Number(event.target.value)
                      : event.target.value,
                  )
                }
              />
            )}
          </Field>
        )
      })}
    </>
  )
}
