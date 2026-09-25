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
  inputClass,
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

export const ChannelEditor = ({
  value,
  onChange,
  platform,
}: {
  value: import("./platformApi.ts").Channel
  onChange: (
    value: import("./platformApi.ts").Channel,
  ) => void
  platform: Platform
}) => {
  const source = platform.sources.find(
    (item) => item.id === value.sourceId,
  )
  const adapter = platform.adapters.find(
    (item) => item.id === source?.adapter,
  )
  const [discovery, setDiscovery] = useState<
    Record<string, { id: string; name: string }[]>
  >({})
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [discoveryError, setDiscoveryError] = useState("")
  const discover = async () => {
    setIsDiscovering(true)
    setDiscoveryError("")
    try {
      const data = await mutate<unknown>(
        `/api/manage/platform/sources/${encodeURIComponent(value.sourceId)}/discover`,
        {},
      )
      const groups = Array.isArray(data)
        ? { entities: data }
        : data
      if (groups && typeof groups === "object")
        setDiscovery(
          Object.fromEntries(
            Object.entries(groups)
              .filter(([, items]) => Array.isArray(items))
              .map(([key, items]) => [
                key,
                (items as unknown[]).filter(
                  (
                    item,
                  ): item is { id: string; name: string } =>
                    Boolean(
                      item &&
                        typeof item === "object" &&
                        "id" in item &&
                        "name" in item,
                    ),
                ),
              ]),
          ),
        )
    } catch (error) {
      setDiscoveryError(
        error instanceof Error
          ? error.message
          : "Could not discover data.",
      )
    } finally {
      setIsDiscovering(false)
    }
  }
  const snapshot = platform.channelStates[value.id]
  return (
    <>
      <Field
        label="Source"
        description="Reuse a connection. Changing a view will not change this source."
      >
        <Picker
          label="Source"
          options={platform.sources.map((item) => ({
            label: item.name,
            value: item.id,
          }))}
          value={value.sourceId}
          onChange={(sourceId) => {
            const nextSource = platform.sources.find(
              (item) => item.id === sourceId,
            )
            const nextAdapter = platform.adapters.find(
              (item) => item.id === nextSource?.adapter,
            )
            setDiscovery({})
            onChange({
              ...value,
              sourceId,
              type: nextAdapter?.channelTypes[0] ?? "",
              settings: initialSettings(
                nextAdapter?.channelSettings,
              ),
            })
          }}
        />
      </Field>
      {!platform.sources.length ? (
        <p>Create a source before you add a channel.</p>
      ) : null}
      <Field label="Data type">
        <Picker
          label="Data type"
          value={value.type}
          options={(adapter?.channelTypes ?? []).map(
            (type) => ({ label: type, value: type }),
          )}
          onChange={(type) => onChange({ ...value, type })}
        />
      </Field>
      {adapter?.channelSettings.some(
        (field) => field.discoveryKey,
      ) ? (
        <div className="grid gap-3">
          <Button
            type="button"
            appearance="outline"
            isLoading={isDiscovering}
            onClick={() => void discover()}
          >
            Discover available items
          </Button>
          {discoveryError ? (
            <p
              role="alert"
              className="text-intent-danger-content"
            >
              {discoveryError}
            </p>
          ) : null}
        </div>
      ) : null}
      <SettingsFields
        key={value.sourceId}
        discovery={discovery}
        fields={adapter?.channelSettings ?? []}
        values={value.settings}
        onChange={(settings) =>
          onChange({ ...value, settings })
        }
      />
      <Field
        label="Stale after (seconds)"
        description="Show a stale status when no new value arrives in this time. Set 0 to disable the timer."
      >
        <input
          className={inputClass}
          type="number"
          min={0}
          value={String(
            value.settings.staleAfterSeconds ??
              (value.type === "images.v1" ? 7200 : 300),
          )}
          onChange={(event) =>
            onChange({
              ...value,
              settings: {
                ...value.settings,
                staleAfterSeconds: Number(
                  event.target.value,
                ),
              },
            })
          }
        />
      </Field>
      <Card heading="Live data">
        <p role="status">
          {snapshot?.status ?? "Waiting for data"}
          {snapshot?.updatedAt
            ? ` · Updated ${new Date(snapshot.updatedAt).toLocaleString()}`
            : ""}
        </p>
        {snapshot?.error ? (
          <p className="mt-2 text-intent-danger-content">
            {snapshot.error}
          </p>
        ) : null}
        {snapshot?.data !== undefined ? (
          <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap text-sm">
            {JSON.stringify(snapshot.data, null, 2)}
          </pre>
        ) : (
          <p className="mt-2 text-content-secondary">
            Save this channel to start its subscription. New
            data appears here automatically.
          </p>
        )}
      </Card>
    </>
  )
}
