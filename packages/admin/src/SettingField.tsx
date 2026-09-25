import { Field, Picker } from "@charcuterie/ui"

type SettingFieldProps = {
  description?: string
  isReadOnly?: boolean
  label: string
  onChange?: (value: string) => void
  options?: readonly { label: string; value: string }[]
  type?: "text" | "number" | "password"
  value: string
  width?: "short" | "medium" | "wide"
  min?: number
  max?: number
}

/** A CastKit setting with the shared Field/Picker contracts and a value-sized width. */
export const SettingField = ({
  description,
  isReadOnly = false,
  label,
  onChange,
  options,
  type = "text",
  value,
  width = "medium",
  min,
  max,
}: SettingFieldProps) => (
  <div className="setting-field" data-width={width}>
    <Field description={description} label={label}>
      {options ? (
        <Picker
          label={label}
          onChange={(nextValue) => onChange?.(nextValue)}
          options={options}
          value={value}
        />
      ) : (
        <input
          className="setting-input"
          max={max}
          min={min}
          onChange={(event) =>
            onChange?.(event.target.value)
          }
          readOnly={isReadOnly}
          type={type}
          value={value}
        />
      )}
    </Field>
  </div>
)
