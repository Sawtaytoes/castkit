import { Card, Field, Picker } from "@charcuterie/ui"
import { inputClass } from "./platformApi.ts"

/** Who may open a view: its access mode and PIN. */
export const AccessFields = ({
  value,
  onChange,
  pin,
  onPinChange,
}: {
  value: {
    access: "public" | "pin"
    hasPin?: boolean
    sessionMinutes?: number
  }
  onChange: (value: {
    access: "public" | "pin"
    sessionMinutes?: number
  }) => void
  pin: string
  onPinChange: (value: string) => void
}) => (
  <Card heading="Access">
    <div className="grid gap-4">
      <Field label="Who can open this link?">
        <Picker
          label="Who can open this link?"
          value={value.access}
          options={[
            { value: "public", label: "Public" },
            { value: "pin", label: "PIN protected" },
          ]}
          onChange={(access) =>
            onChange({
              ...value,
              access: access as "public" | "pin",
            })
          }
        />
      </Field>
      {value.access === "pin" ? (
        <>
          <Field
            label={value.hasPin ? "Replace PIN" : "PIN"}
            description={
              value.hasPin
                ? "Leave blank to keep the saved PIN."
                : "PIN not set. Set a PIN to let visitors unlock this page with its on-screen keypad. Management can preview it now."
            }
            isRequired={!value.hasPin}
          >
            <input
              className={inputClass}
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={pin}
              onChange={(event) =>
                onPinChange(event.target.value)
              }
            />
          </Field>
          <Field
            label="Unlock duration (minutes)"
            description="The page locks when this session expires."
          >
            <input
              className={inputClass}
              type="number"
              min={1}
              max={525600}
              value={value.sessionMinutes ?? 60}
              onChange={(event) =>
                onChange({
                  ...value,
                  sessionMinutes: Number(
                    event.target.value,
                  ),
                })
              }
            />
          </Field>
        </>
      ) : null}
    </div>
  </Card>
)
