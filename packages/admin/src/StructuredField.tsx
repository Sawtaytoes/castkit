import { Button } from "@charcuterie/ui"
import { StructuredValue } from "./StructuredValue.tsx"
import { schemas } from "./structuredSchema.ts"

/** Edits a JSON setting through the form its schema describes. */
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
