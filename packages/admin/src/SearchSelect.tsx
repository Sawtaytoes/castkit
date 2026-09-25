import { Button, Combobox } from "@charcuterie/ui"
import { useState } from "react"

/** Searchable selection using the shared picker, with app-owned labels. */
export const SearchSelect = ({
  label,
  value,
  options,
  onChange,
  isMultiple = false,
}: {
  label: string
  value: string | string[]
  options: {
    label: string
    value: string
    textValue?: string
    isDisabled?: boolean
  }[]
  onChange: (value: string) => void
  isMultiple?: boolean
}) => {
  const [isVisible, setIsVisible] = useState(false)
  return (
    <Combobox
      isVisible={isVisible}
      onDismiss={() => setIsVisible(false)}
      isMultiple={isMultiple}
      selectedValue={value}
      placeholder={`Search ${label.toLowerCase()}`}
      options={options}
      onSelect={(next) => {
        onChange(next)
        if (!isMultiple) setIsVisible(false)
      }}
      trigger={
        <Button
          type="button"
          appearance="outline"
          onClick={() => setIsVisible(true)}
        >
          {Array.isArray(value)
            ? `${value.length} selected`
            : options.find(
                (option) => option.value === value,
              )?.label || `Choose ${label.toLowerCase()}`}
        </Button>
      }
    />
  )
}
