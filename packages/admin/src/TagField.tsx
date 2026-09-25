import { Button, Combobox, Field } from "@charcuterie/ui"
import { useState } from "react"

/** Editable tags share the library's searchable multi-select and creation behavior. */
export const TagField = ({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string[]
  options: string[]
  onChange: (value: string[]) => void
}) => {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <Field
      label={label}
      description="Select an existing tag, or type a new tag and press Enter."
    >
      <Combobox
        isVisible={isOpen}
        isMultiple
        isCreatable
        onDismiss={() => setIsOpen(false)}
        selectedValue={value}
        placeholder="Find or add a tag"
        options={[...new Set(options.concat(value))]
          .sort()
          .map((tag) => ({ label: tag, value: tag }))}
        onSelect={(tag) => {
          const trimmed = tag.trim()
          if (trimmed)
            onChange(
              value.includes(trimmed)
                ? value.filter((item) => item !== trimmed)
                : value.concat(trimmed),
            )
        }}
        trigger={
          <Button
            type="button"
            appearance="outline"
            onClick={() => setIsOpen(true)}
          >
            {value.length ? value.join(" · ") : "Add tags"}
          </Button>
        }
      />
    </Field>
  )
}
