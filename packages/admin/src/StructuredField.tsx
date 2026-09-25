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

type Schema = {
  kind?: "map" | "list" | "object" | "condition"
  label?: string
  keyLabel?: string
  item?: Schema
  fields?: Record<string, Schema>
  initial?: unknown
}
const text = (label: string): Schema => ({
  label,
  initial: "",
})
const condition: Schema = { kind: "condition", initial: [] }
const map = (keyLabel: string, item: Schema): Schema => ({
  kind: "map",
  keyLabel,
  item,
  initial: {},
})
const list = (item: Schema, label = "item"): Schema => ({
  kind: "list",
  item,
  label,
  initial: [],
})
const schemas: Record<string, Schema> = {
  aliases: map("Entity ID", text("Display label")),
  labelsFromEntities: map(
    "Entity ID",
    text("Label provider entity ID"),
  ),
  entityVisibility: map("Entity ID", condition),
  actionVisibility: map(
    "Entity ID",
    map("Action", condition),
  ),
  visibleWhen: condition,
  scriptFields: map(
    "Script entity ID",
    list(text("Variable name"), "variable"),
  ),
  attributeFields: list(
    {
      kind: "object",
      initial: {
        entityId: "",
        attribute: "",
        label: "",
        format: "text",
      },
      fields: {
        entityId: text("Entity ID"),
        attribute: text("Attribute"),
        label: text("Label"),
        format: text("Format"),
      },
    },
    "attribute",
  ),
  actionButtons: list(
    {
      kind: "object",
      initial: {
        name: "",
        entityId: "",
        action: "",
        payload: {},
        isConfirmationRequired: false,
      },
      fields: {
        name: text("Button name"),
        entityId: text("Entity ID"),
        action: text("Action"),
        payload: map("Parameter", {}),
        visibleWhen: condition,
        isConfirmationRequired: {
          label: "Require confirmation",
          initial: false,
        },
      },
    },
    "button",
  ),
}
const kindOf = (value: unknown) =>
  value === null
    ? "null"
    : Array.isArray(value)
      ? "list"
      : typeof value === "object"
        ? "object"
        : typeof value
const newValue = (kind: string): unknown =>
  ({
    text: "",
    string: "",
    number: 0,
    boolean: false,
    null: null,
    object: {},
    list: [],
  })[kind as "text"]
const title = (value: string) =>
  value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (letter) => letter.toUpperCase())

/** Row identity belongs to the editor, not to mutable entity IDs or array positions. */
const Rows = ({
  value,
  schema,
  onChange,
}: {
  value: unknown
  schema: Schema
  onChange: (value: unknown) => void
}) => {
  const isList =
    schema.kind === "list" || Array.isArray(value)
  const [rows, setRows] = useState(() =>
    (isList
      ? (Array.isArray(value) ? value : []).map(
          (item) => ["", item] as const,
        )
      : Object.entries(
          (value ?? {}) as Record<string, unknown>,
        )
    ).map(([key, item]) => ({
      id: crypto.randomUUID(),
      key,
      value: item,
    })),
  )
  const update = (next: typeof rows) => {
    setRows(next)
    onChange(
      isList
        ? next.map((row) => row.value)
        : Object.fromEntries(
            next.map((row) => [row.key, row.value]),
          ),
    )
  }
  return (
    <div className="structured-rows">
      {rows.map((row, index) => (
        <div key={row.id} className="structured-row">
          <div className="structured-row-head">
            <strong>
              {isList
                ? `${title(schema.label ?? "Item")} ${index + 1}`
                : "Entry"}
            </strong>
            <Button
              type="button"
              size="sm"
              appearance="outline"
              onClick={() =>
                update(
                  rows.filter((item) => item.id !== row.id),
                )
              }
            >
              Remove{" "}
              {isList ? (schema.label ?? "item") : "entry"}
            </Button>
          </div>
          {!isList ? (
            <Field label={schema.keyLabel ?? "Field name"}>
              <input
                required
                className={inputClass}
                value={row.key}
                ref={(input) => {
                  input?.setCustomValidity(
                    rows.some(
                      (other) =>
                        other.id !== row.id &&
                        other.key === row.key,
                    )
                      ? "Each entry needs a unique name."
                      : "",
                  )
                }}
                onChange={(event) =>
                  update(
                    rows.map((item) =>
                      item.id === row.id
                        ? {
                            ...item,
                            key: event.target.value,
                          }
                        : item,
                    ),
                  )
                }
              />
            </Field>
          ) : null}
          <StructuredValue
            value={row.value}
            schema={schema.item ?? {}}
            onChange={(next) =>
              update(
                rows.map((item) =>
                  item.id === row.id
                    ? { ...item, value: next }
                    : item,
                ),
              )
            }
          />
        </div>
      ))}
      <Button
        type="button"
        appearance="outline"
        onClick={() =>
          update([
            ...rows,
            {
              id: crypto.randomUUID(),
              key: "",
              value: structuredClone(
                schema.item?.initial ?? "",
              ),
            },
          ])
        }
      >
        Add {isList ? (schema.label ?? "item") : "entry"}
      </Button>
    </div>
  )
}
const StructuredValue = ({
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
    <Rows
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
export const StructuredField = ({
  fieldKey,
  label,
  value,
  onChange,
}: {
  fieldKey: string
  label: string
  value: unknown
  onChange: (value: unknown) => void
}) => {
  const schema =
    schemas[fieldKey.replace(/Json$/, "")] ?? {}
  const read = (): { value: unknown; error?: string } => {
    if (value === "" || value === undefined)
      return {
        value: structuredClone(schema.initial ?? {}),
      }
    if (typeof value !== "string") return { value }
    try {
      return { value: JSON.parse(value) }
    } catch {
      return {
        value: null,
        error:
          "The saved data could not be read. It has not been changed.",
      }
    }
  }
  const parsed = read()
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-3 font-medium">{label}</legend>
      {parsed.error ? (
        <>
          <p role="alert">{parsed.error}</p>
          <Button
            type="button"
            appearance="outline"
            onClick={() => {
              if (
                confirm(
                  "Replace the unreadable data with an empty form?",
                )
              )
                onChange(
                  fieldKey.endsWith("Json")
                    ? JSON.stringify(schema.initial ?? {})
                    : (schema.initial ?? {}),
                )
            }}
          >
            Reset this field
          </Button>
        </>
      ) : (
        <StructuredValue
          value={parsed.value}
          schema={schema}
          onChange={(next) =>
            onChange(
              fieldKey.endsWith("Json")
                ? JSON.stringify(next)
                : next,
            )
          }
        />
      )}
    </fieldset>
  )
}
export const StringListField = ({
  value,
  onChange,
}: {
  value: unknown
  onChange: (value: string[]) => void
}) => (
  <Rows
    value={
      Array.isArray(value)
        ? value
        : typeof value === "string" && value
          ? value.split("\n")
          : []
    }
    schema={list(text("Value"))}
    onChange={(next) => onChange(next as string[])}
  />
)
