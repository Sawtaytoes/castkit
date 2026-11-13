import { StructuredRows } from "./StructuredRows.tsx"
import { list, text } from "./structuredSchema.ts"

/** Edits a list of strings, one row each. */
export const StringListField = ({
  value,
  onChange,
}: {
  value: unknown
  onChange: (value: string[]) => void
}) => (
  <StructuredRows
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
