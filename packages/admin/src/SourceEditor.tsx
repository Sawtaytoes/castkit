import {
  Button,
  Card,
  Checkbox,
  Field,
  Picker,
} from "@charcuterie/ui"
import { useState } from "react"
import {
  initialSettings,
  mutate,
  type Platform,
  type Settings,
  type Source,
} from "./platformApi.ts"
import { SettingsFields } from "./SettingsFields.tsx"

export const SourceEditor = ({
  value,
  onChange,
  platform,
  onSecretsChange,
}: {
  value: Source
  onChange: (value: Source) => void
  platform: Platform
  onSecretsChange: (value: Settings) => void
}) => {
  const adapter = platform.adapters.find(
    (item) => item.id === value.adapter,
  )
  const [secrets, setSecrets] = useState<Settings>({})
  const [discovery, setDiscovery] = useState<unknown>()
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [error, setError] = useState("")
  const discover = async () => {
    setIsDiscovering(true)
    setError("")
    try {
      setDiscovery(
        await mutate(
          `/api/manage/platform/sources/${encodeURIComponent(value.id)}/discover`,
          {},
        ),
      )
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Discovery failed.",
      )
    } finally {
      setIsDiscovering(false)
    }
  }
  return (
    <>
      <Field
        label="Source adapter"
        description="One connection can supply several named channels."
      >
        <Picker
          label="Source adapter"
          options={platform.adapters.map((item) => ({
            label: item.name,
            value: item.id,
          }))}
          value={value.adapter}
          onChange={(id) => {
            const next = platform.adapters.find(
              (item) => item.id === id,
            )
            onChange({
              ...value,
              adapter: id,
              settings: initialSettings(next?.settings),
            })
            setSecrets({})
            onSecretsChange({})
            setDiscovery(undefined)
          }}
        />
      </Field>
      {adapter ? (
        <p className="text-content-secondary">
          {adapter.description}
        </p>
      ) : null}
      <Checkbox
        label="Source enabled"
        isChecked={value.isEnabled}
        onChange={(isEnabled) =>
          onChange({ ...value, isEnabled })
        }
      />
      <SettingsFields
        fields={(adapter?.settings ?? []).filter(
          (field) => field.type !== "secret",
        )}
        values={value.settings}
        onChange={(settings) =>
          onChange({ ...value, settings })
        }
      />
      {(adapter?.settings ?? []).some(
        (field) => field.type === "secret",
      ) ? (
        <Card heading="Credentials">
          <div className="grid gap-4">
            {value.configuredSecrets?.length ? (
              <p className="text-sm text-content-secondary">
                Saved credentials:{" "}
                {value.configuredSecrets.join(", ")}
              </p>
            ) : null}
            <SettingsFields
              fields={
                adapter?.settings.filter(
                  (field) => field.type === "secret",
                ) ?? []
              }
              values={secrets}
              isSecret
              onChange={(next) => {
                setSecrets(next)
                onSecretsChange(next)
              }}
            />
          </div>
        </Card>
      ) : null}
      {platform.sources.some(
        (source) => source.id === value.id,
      ) ? (
        <Card heading="Discover available data">
          <p className="mb-3 text-content-secondary">
            Save connection changes first. Discovery lists
            the items this adapter can offer to channels.
          </p>
          <Button
            appearance="outline"
            type="button"
            isLoading={isDiscovering}
            onClick={() => void discover()}
          >
            Discover data
          </Button>
          {error ? (
            <p
              role="alert"
              className="mt-3 text-intent-danger-content"
            >
              {error}
            </p>
          ) : null}
          {discovery !== undefined ? (
            <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap text-sm">
              {JSON.stringify(discovery, null, 2)}
            </pre>
          ) : null}
        </Card>
      ) : null}
    </>
  )
}
