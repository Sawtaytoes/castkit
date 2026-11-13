import { Button, Field } from "@charcuterie/ui"
import { useState } from "react"
import { inputClass } from "./platformApi.ts"
import { StructuredValue } from "./StructuredValue.tsx"
import { type Schema, title } from "./structuredSchema.ts"

/** Row identity belongs to the editor, not to mutable entity IDs or array positions. */
export const StructuredRows = ({
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
