import { parseCondition } from "@castkit/sdk/conditions"
import {
  Button,
  Checkbox,
  Field,
  Picker,
} from "@charcuterie/ui"
import { useState } from "react"
import { ConditionField } from "./ConditionField.tsx"
import { inputClass } from "./platformApi.ts"
import { StructuredRows } from "./StructuredRows.tsx"
import {
  kindOf,
  newValue,
  type Schema,
  title,
} from "./structuredSchema.ts"

/** Edits one JSON value by its kind: text, number, switch, condition, object, or list. */
export const StructuredValue = ({
  value,
  schema = {},
  onChange,
}: {
  value: unknown
  schema?: Schema
  onChange: (value: unknown) => void
}) => {
  const kind = kindOf(value)
  const [isCondition] = useState(
    () =>
      schema.kind === "condition" &&
      parseCondition(value) !== null,
  )
  if (isCondition)
    return (
      <ConditionField value={value} onChange={onChange} />
    )
  if (
    schema.kind === "object" &&
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  ) {
    const record = value as Record<string, unknown>
    return (
      <div className="grid gap-3">
        {Object.entries(record).map(([key, item]) => (
          <div key={key}>
            <StructuredValue
              value={item}
              schema={
                schema.fields?.[key] ?? {
                  label: title(key),
                }
              }
              onChange={(next) =>
                onChange({ ...record, [key]: next })
              }
            />
          </div>
        ))}
        {Object.entries(schema.fields ?? {})
          .filter(([key]) => !(key in record))
          .map(([key, field]) => (
            <Button
              key={key}
              type="button"
              appearance="outline"
              onClick={() =>
                onChange({
                  ...record,
                  [key]: structuredClone(
                    field.initial ?? "",
                  ),
                })
              }
            >
              Add {field.label ?? title(key)}
            </Button>
          ))}
      </div>
    )
  }
  const isContainer = kind === "list" || kind === "object"
  const body = isContainer ? (
    <StructuredRows
      key={kind}
      value={value}
      schema={schema}
      onChange={onChange}
    />
  ) : kind === "boolean" ? (
    <Checkbox
      label={schema.label ?? "Enabled"}
      isChecked={Boolean(value)}
      onChange={onChange}
    />
  ) : kind === "null" ? (
    <p>No value</p>
  ) : (
    <Field label={schema.label ?? "Value"}>
      <input
        className={inputClass}
        type={kind === "number" ? "number" : "text"}
        step="any"
        value={String(value ?? "")}
        onChange={(event) =>
          onChange(
            kind === "number"
              ? Number(event.target.value)
              : event.target.value,
          )
        }
      />
    </Field>
  )
  return (
    <div className="grid gap-3">
      {!schema.kind && schema.initial === undefined ? (
        <Field label="Value type">
          <Picker
            label="Value type"
            value={kind}
            options={[
              { label: "Text", value: "string" },
              { label: "Number", value: "number" },
              { label: "Yes / no", value: "boolean" },
              { label: "Fields", value: "object" },
              { label: "List", value: "list" },
              { label: "No value", value: "null" },
            ]}
            onChange={(next) => onChange(newValue(next))}
          />
        </Field>
      ) : null}
      {schema.label && isContainer ? (
        <strong>{schema.label}</strong>
      ) : null}
      {body}
    </div>
  )
}
