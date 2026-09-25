import {
  Button,
  Card,
  EmptyState,
  Field,
} from "@charcuterie/ui"
import { useState } from "react"
import { AccessIndicator } from "./AccessIndicator.tsx"
import {
  api,
  type Channel,
  type Collection,
  type Definition,
  initialSettings,
  inputClass,
  mutate,
  type Platform,
  type Screen,
  type Settings,
  type Source,
  type View,
} from "./platformApi.ts"
import { ScreenEditor } from "./ScreenEditor.tsx"
import {
  ChannelEditor,
  SourceEditor,
} from "./SourceEditor.tsx"
import { ViewEditor } from "./ViewEditor.tsx"

const titles = {
  sources: "Source",
  channels: "Channel",
  views: "View",
  screens: "Screen",
}
const descriptions = {
  sources:
    "Configure a connection once. Its channels can supply any number of views.",
  channels:
    "Choose typed data from a source. Each named channel stays independent of displays.",
  views:
    "Combine view components and bind their inputs to compatible data channels.",
  screens:
    "Keep one browser URL while CastKit or an automation changes the view.",
}
const blank = (
  collection: Collection,
  platform: Platform,
): Definition => {
  const identity = { id: "", name: "" }
  if (collection === "sources")
    return {
      ...identity,
      adapter: platform.adapters[0]?.id ?? "",
      settings: initialSettings(
        platform.adapters[0]?.settings,
      ),
      isEnabled: true,
    }
  if (collection === "channels") {
    const source = platform.sources[0]
    const adapter = platform.adapters.find(
      (item) => item.id === source?.adapter,
    )
    return {
      ...identity,
      sourceId: source?.id ?? "",
      type: adapter?.channelTypes[0] ?? "",
      settings: initialSettings(adapter?.channelSettings),
    }
  }
  if (collection === "views")
    return {
      ...identity,
      layout: "single",
      panels: [
        {
          id: crypto.randomUUID(),
          specId: platform.viewSpecs[0]?.id ?? "",
          bindings: {},
          settings: initialSettings(
            platform.viewSpecs[0]?.settings,
          ),
        },
      ],
      theme: "auto",
      access: "public",
      isControlEnabled: false,
    }
  return {
    ...identity,
    defaultViewId: platform.views[0]?.id ?? "",
    viewIds: platform.views[0]
      ? [platform.views[0].id]
      : [],
    access: "public",
  }
}

export const CollectionPage = ({
  collection,
  platform,
  onRefresh,
}: {
  collection: Collection
  platform: Platform
  onRefresh: () => Promise<void>
}) => {
  const [draft, setDraft] = useState<Definition | null>(
    null,
  )
  const [editingId, setEditingId] = useState<string | null>(
    null,
  )
  const [secrets, setSecrets] = useState<Settings>({})
  const [pin, setPin] = useState("")
  const [message, setMessage] = useState("")
  const [isError, setIsError] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [editorKey, setEditorKey] = useState(0)
  const [isPreviewVisible, setIsPreviewVisible] =
    useState(false)
  const records = platform[collection]
  const title = titles[collection]
  const isSaved = editingId !== null
  const begin = (record: Definition | null) => {
    setDraft(
      record
        ? structuredClone(record)
        : blank(collection, platform),
    )
    setEditingId(record?.id ?? null)
    setSecrets({})
    setPin("")
    setMessage("")
    setIsError(false)
    setIsPreviewVisible(false)
    setEditorKey((value) => value + 1)
  }
  const save = async () => {
    if (!draft) return
    setIsBusy(true)
    setMessage("")
    setIsError(false)
    try {
      if (collection === "views") {
        for (const panel of (draft as View).panels) {
          for (const [key, value] of Object.entries(
            panel.settings,
          )) {
            if (
              key.endsWith("Json") &&
              typeof value === "string" &&
              value.trim()
            ) {
              try {
                JSON.parse(value)
              } catch {
                throw new Error(
                  `Enter valid JSON for ${key} in this panel.`,
                )
              }
            }
          }
          const spec = platform.viewSpecs.find(
            (item) => item.id === panel.specId,
          )
          const missing = spec?.inputs.find(
            (input) =>
              input.isRequired &&
              !panel.bindings[input.key],
          )
          if (missing)
            throw new Error(
              `Choose a ${missing.label} channel for ${spec?.name}.`,
            )
        }
      }
      const cleanSecrets = Object.fromEntries(
        Object.entries(secrets).filter(
          ([, value]) => value !== "",
        ),
      )
      await mutate(
        `/api/manage/platform/${collection}${isSaved ? `/${encodeURIComponent(editingId)}` : ""}`,
        {
          ...draft,
          ...(Object.keys(cleanSecrets).length
            ? { secrets: cleanSecrets }
            : {}),
          ...(pin ? { pin } : {}),
        },
        isSaved ? "PUT" : "POST",
      )
      setSecrets({})
      setPin("")
      setEditorKey((value) => value + 1)
      if (
        "access" in draft &&
        draft.access === "pin" &&
        pin
      )
        setDraft({ ...draft, hasPin: true })
      setEditingId(draft.id)
      setMessage(`${title} saved.`)
      await onRefresh()
    } catch (error) {
      setIsError(true)
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not save.",
      )
    } finally {
      setIsBusy(false)
    }
  }
  const remove = async () => {
    if (
      !draft ||
      !editingId ||
      !confirm(`Delete ${draft.name}?`)
    )
      return
    setIsBusy(true)
    try {
      await api(
        `/api/manage/platform/${collection}/${encodeURIComponent(editingId)}`,
        { method: "DELETE" },
      )
      begin(null)
      setDraft(null)
      await onRefresh()
    } catch (error) {
      setIsError(true)
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not delete.",
      )
    } finally {
      setIsBusy(false)
    }
  }
  const url =
    draft &&
    (collection === "views" || collection === "screens")
      ? `/${collection === "views" ? "view" : "screen"}/${encodeURIComponent(draft.id)}`
      : null
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="max-w-3xl text-content-secondary">
          {descriptions[collection]}
        </p>
        <Button onClick={() => begin(null)}>
          Add {title.toLowerCase()}
        </Button>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(14rem,1fr)_minmax(0,2fr)]">
        <Card
          className="min-w-0"
          heading={
            collection[0]?.toUpperCase() +
            collection.slice(1)
          }
        >
          <div className="grid min-w-0 gap-2">
            {records.map((record) => (
              <Button
                key={record.id}
                isFullWidth
                className="min-w-0"
                title={record.name}
                aria-pressed={editingId === record.id}
                appearance={
                  editingId === record.id
                    ? "solid"
                    : "outline"
                }
                onClick={() => begin(record)}
              >
                <span className="min-w-0 truncate">
                  {record.name}
                </span>
                {"access" in record &&
                record.access === "pin" ? (
                  <AccessIndicator hasPin={record.hasPin} />
                ) : null}
              </Button>
            ))}
            {!records.length ? (
              <EmptyState
                heading={`No ${collection} yet`}
                description={`Add a ${title.toLowerCase()} to get started.`}
                size="sm"
              />
            ) : null}
          </div>
        </Card>
        {draft ? (
          <Card
            heading={
              isSaved
                ? `Edit ${title.toLowerCase()}`
                : `New ${title.toLowerCase()}`
            }
          >
            <form
              className="grid gap-5"
              onSubmit={(event) => {
                event.preventDefault()
                void save()
              }}
            >
              <Field label={`${title} name`} isRequired>
                <input
                  className={inputClass}
                  value={draft.name}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      name: event.target.value,
                      ...(!isSaved &&
                      (!draft.id ||
                        draft.id ===
                          draft.name
                            .toLowerCase()
                            .replace(/[^a-z0-9]+/g, "-")
                            .replace(/^-|-$/g, ""))
                        ? {
                            id: event.target.value
                              .toLowerCase()
                              .replace(/[^a-z0-9]+/g, "-")
                              .replace(/^-|-$/g, ""),
                          }
                        : {}),
                    })
                  }
                />
              </Field>
              <Field
                label={`${title} ID`}
                description={
                  collection === "channels"
                    ? "Use lowercase letters, numbers, dots, underscores, and hyphens. Separate channel groups with a slash. The ID is permanent after creation."
                    : "Use lowercase letters, numbers, and hyphens. The ID is permanent after creation."
                }
                isRequired
              >
                <input
                  className={inputClass}
                  disabled={isSaved}
                  pattern={
                    collection === "channels"
                      ? "[a-z0-9][a-z0-9._\\-]*(\\/[a-z0-9][a-z0-9._\\-]*)*"
                      : "[a-z0-9][a-z0-9\\-]*"
                  }
                  value={draft.id}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      id: event.target.value,
                    })
                  }
                />
              </Field>
              {collection === "sources" ? (
                <SourceEditor
                  key={editorKey}
                  value={draft as Source}
                  onChange={setDraft}
                  platform={platform}
                  onSecretsChange={setSecrets}
                />
              ) : null}
              {collection === "channels" ? (
                <ChannelEditor
                  key={editorKey}
                  value={draft as Channel}
                  onChange={setDraft}
                  platform={platform}
                />
              ) : null}
              {collection === "views" ? (
                <ViewEditor
                  key={editorKey}
                  value={draft as View}
                  onChange={setDraft}
                  platform={platform}
                  pin={pin}
                  onPinChange={setPin}
                />
              ) : null}
              {collection === "screens" ? (
                <ScreenEditor
                  key={editorKey}
                  value={draft as Screen}
                  onChange={setDraft}
                  platform={platform}
                  pin={pin}
                  onPinChange={setPin}
                  onRefresh={onRefresh}
                />
              ) : null}
              {message ? (
                <p
                  role={isError ? "alert" : "status"}
                  className={
                    isError
                      ? "text-intent-danger-content"
                      : "text-content-secondary"
                  }
                >
                  {message}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-3">
                {isSaved ? (
                  <Button
                    type="button"
                    appearance="outline"
                    intent="danger"
                    isDisabled={isBusy}
                    onClick={() => void remove()}
                  >
                    Delete {title.toLowerCase()}
                  </Button>
                ) : (
                  <span />
                )}
                <Button type="submit" isLoading={isBusy}>
                  Save {title.toLowerCase()}
                </Button>
              </div>
              {url && isSaved ? (
                <div className="grid gap-3 border-t border-border-subtle pt-4">
                  <a
                    className="break-all underline"
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open {url}
                  </a>
                  <Button
                    appearance="outline"
                    type="button"
                    onClick={() =>
                      setIsPreviewVisible(
                        (isVisible) => !isVisible,
                      )
                    }
                  >
                    {isPreviewVisible
                      ? "Hide preview"
                      : "Preview saved version"}
                  </Button>
                  {isPreviewVisible ? (
                    <iframe
                      className="h-96 w-full rounded-md border border-border-default"
                      src={url}
                      title={`${draft.name} preview`}
                    />
                  ) : null}
                </div>
              ) : null}
            </form>
          </Card>
        ) : (
          <Card>
            <EmptyState
              heading={`Choose a ${title.toLowerCase()}`}
              description={`Select an existing ${title.toLowerCase()} or add a new one.`}
            />
          </Card>
        )}
      </div>
    </div>
  )
}
