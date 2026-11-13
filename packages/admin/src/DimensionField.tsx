import { Field } from "@charcuterie/ui"
import { useEffect, useState } from "react"
import { inputClass } from "./platformApi.ts"

/** A pixel dimension that commits on blur or Enter, and restores an invalid draft. */
export const DimensionField = ({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (value: number) => void
}) => {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  return (
    <Field label={label}>
      <input
        className={inputClass}
        type="number"
        min={120}
        max={7680}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (
            draft.trim() &&
            Number.isFinite(Number(draft))
          )
            onChange(Number(draft))
          else setDraft(String(value))
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            event.currentTarget.blur()
          }
        }}
      />
    </Field>
  )
}
