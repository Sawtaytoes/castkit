import {
  Button,
  Card,
  Combobox,
  EmptyState,
  Field,
  Picker,
  Tabs,
} from "@charcuterie/ui"
import { useEffect, useRef, useState } from "react"
import {
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router"
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
import { TagField } from "./TagField.tsx"
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
    "Configure a named screen for a browser, kiosk, or assigned display.",
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
  const [searchParams, setSearchParams] = useSearchParams()
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [tagFilter, setTagFilter] = useState("")
  const [previewRevision, setPreviewRevision] = useState(0)
  const nameRef = useRef<HTMLInputElement>(null)
  const invalidRef = useRef<HTMLInputElement | null>(null)
  const handledSelection = useRef<string | null>(null)
  const location = useLocation()
  const navigate = useNavigate()
  const requestedTab =
    location.pathname.split("/")[2] ?? "general"
  const sections =
    collection === "views"
      ? ["general", "panels", "appearance", "access"]
      : collection === "screens"
        ? ["general", "views", "switching", "access"]
        : ["general", "settings"]
  const section = sections.includes(requestedTab)
    ? requestedTab
    : "general"
  useEffect(() => {
    const invalid = invalidRef.current
    if (invalid && !invalid.closest("[hidden]")) {
      invalid.focus()
      invalidRef.current = null
    }
  })
  const selectedId = searchParams.get("item")
  const tags = [
    ...new Set(
      platform[collection].flatMap(
        (record) => record.tags ?? [],
      ),
    ),
  ].sort()
  const filteredRecords = platform[collection]
    .filter(
      (record) =>
        !tagFilter ||
        (tagFilter === "__untagged"
          ? !record.tags?.length
          : record.tags?.includes(tagFilter)),
    )
    .toSorted(
      (first, second) =>
        (first.tags?.[0] ?? "").localeCompare(
          second.tags?.[0] ?? "",
        ) || first.name.localeCompare(second.name),
    )
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
    setPreviewRevision((value) => value + 1)
    setEditorKey((value) => value + 1)
    handledSelection.current = record?.id ?? "__new"
    navigate(
      `/${collection}/general?${new URLSearchParams(record ? { item: record.id } : { new: "1" })}`,
    )
    setIsPickerOpen(false)
    requestAnimationFrame(() => {
      nameRef.current?.focus()
      nameRef.current?.scrollIntoView({ block: "nearest" })
    })
  }
  useEffect(() => {
    if (
      !selectedId ||
      handledSelection.current === selectedId
    )
      return
    const record = records.find(
      (item) => item.id === selectedId,
    )
    if (!record) return
    handledSelection.current = selectedId
    setDraft(structuredClone(record))
    setEditingId(record.id)
    setPin("")
    setSecrets({})
    setMessage("")
    setEditorKey((current) => current + 1)
  }, [selectedId, records])
  const save = async () => {
    if (!draft) return
    setIsBusy(true)
    setMessage("")
    setIsError(false)
    try {
      if (!draft.name.trim() || !draft.id.trim())
        throw new Error(
          `Enter a name and ID for this ${title.toLowerCase()}.`,
        )
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
      handledSelection.current = draft.id
      setSearchParams({ item: draft.id }, { replace: true })
      setPreviewRevision((value) => value + 1)
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
    <div className="collection-page grid min-w-0 gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="max-w-3xl text-content-secondary">
          {descriptions[collection]}
        </p>
        <Button onClick={() => begin(null)}>
          Add {title.toLowerCase()}
        </Button>
      </div>
      <div className="collection-picker">
        <Field label={`Find a ${title.toLowerCase()}`}>
          <Combobox
            key={editingId ?? "new"}
            isVisible={isPickerOpen}
            onDismiss={() => setIsPickerOpen(false)}
            onSelect={(id) => {
              const record = records.find(
                (item) => item.id === id,
              )
              if (record) begin(record)
            }}
            selectedValue={editingId ?? undefined}
            placeholder={`Search ${collection} by name, ID, or tag`}
            options={filteredRecords.map((record) => ({
              value: record.id,
              textValue: `${record.name} ${record.id} ${(record.tags ?? []).join(" ")}`,
              label: (
                <span className="record-option">
                  <strong>{record.name}</strong>
                  <span>
                    {record.tags?.join(" · ") || "Untagged"}
                  </span>
                </span>
              ),
            }))}
            trigger={
              <Button
                appearance="outline"
                className="w-full min-w-0"
                onClick={() => setIsPickerOpen(true)}
              >
                <span className="truncate">
                  {isSaved
                    ? draft?.name
                    : `Choose from ${filteredRecords.length} ${collection}`}
                </span>
              </Button>
            }
          />
        </Field>
        <Field label="Filter by tag">
          <Picker
            label="Filter by tag"
            value={tagFilter}
            onChange={setTagFilter}
            options={[
              { label: "All tags", value: "" },
              { label: "Untagged", value: "__untagged" },
              ...tags.map((tag) => ({
                label: tag,
                value: tag,
              })),
            ]}
          />
        </Field>
        <p className="text-content-secondary text-sm">
          {filteredRecords.length} of {records.length}{" "}
          {collection}
        </p>
      </div>
      <div
        className="collection-workspace"
        data-has-preview={Boolean(url)}
      >
        {draft ? (
          <Card
            className="collection-editor"
            heading={
              isSaved
                ? `Edit ${title.toLowerCase()}`
                : `New ${title.toLowerCase()}`
            }
          >
            <Tabs
              label={`${title} settings`}
              className="collection-tabs"
              activeHref={`/${collection}/${section}`}
              tabs={sections.map((name) => ({
                label:
                  name[0]?.toUpperCase() + name.slice(1),
                href: `/${collection}/${name}?${searchParams}`,
              }))}
            />
            <form
              noValidate
              className="grid gap-5"
              onSubmit={(event) => {
                event.preventDefault()
                if (!event.currentTarget.checkValidity()) {
                  setIsError(true)
                  setMessage(
                    "Complete the required fields and correct invalid entries before saving.",
                  )
                  const invalid =
                    event.currentTarget.querySelector(
                      "input:invalid, select:invalid, textarea:invalid",
                    ) as HTMLInputElement | null
                  invalidRef.current = invalid
                  const targetSection = invalid
                    ?.closest("[data-editor-section]")
                    ?.getAttribute("data-editor-section")
                  if (
                    targetSection &&
                    targetSection !== section
                  )
                    navigate(
                      `/${collection}/${targetSection}?${searchParams}`,
                    )
                  // Reveal collapsed setting groups before focusing the invalid control.
                  const ancestors = (
                    element: Element | null,
                  ): Element[] =>
                    element
                      ? [
                          element,
                          ...ancestors(
                            element.parentElement,
                          ),
                        ]
                      : []
                  ancestors(invalid)
                    .filter(
                      (element) =>
                        element.hasAttribute("hidden") &&
                        element.id,
                    )
                    .forEach((element) => {
                      const trigger =
                        event.currentTarget.querySelector(
                          `[aria-controls="${CSS.escape(element.id)}"]`,
                        ) as HTMLButtonElement | null
                      trigger?.click()
                    })
                  requestAnimationFrame(() => {
                    if (!invalid?.closest("[hidden]"))
                      invalid?.focus()
                  })
                  return
                }
                void save()
              }}
            >
              <div
                className="grid gap-4"
                hidden={section !== "general"}
                data-editor-section="general"
              >
                <Field label={`${title} name`} isRequired>
                  <input
                    ref={nameRef}
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
                <TagField
                  key={editingId ?? "new"}
                  label="Tags"
                  value={draft.tags ?? []}
                  options={tags}
                  onChange={(tags) =>
                    setDraft({ ...draft, tags })
                  }
                />
              </div>
              <div
                hidden={section !== "settings"}
                data-editor-section="settings"
                className="grid gap-4"
              >
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
              </div>
              {collection === "views" ? (
                <ViewEditor
                  key={editorKey}
                  section={section}
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
                  section={section}
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
              <div className="collection-savebar flex flex-wrap items-center justify-between gap-3">
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
        {url && draft ? (
          <aside className="collection-preview">
            <Card
              heading="Preview"
              actions={
                isSaved ? (
                  <Button
                    size="sm"
                    appearance="outline"
                    onClick={() =>
                      setPreviewRevision(
                        (current) => current + 1,
                      )
                    }
                  >
                    Refresh
                  </Button>
                ) : null
              }
            >
              {isSaved ? (
                <>
                  <p className="text-content-secondary text-sm">
                    Saved version. Save your changes to
                    update the preview.
                  </p>
                  <iframe
                    key={`${url}:${previewRevision}`}
                    src={`${url}?preview=1`}
                    title={`${draft.name} preview`}
                    inert
                    tabIndex={-1}
                    className="collection-preview-frame"
                  />
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    Open in a new tab
                  </a>
                </>
              ) : (
                <p>
                  Save this {title.toLowerCase()} to preview
                  it here.
                </p>
              )}
            </Card>
          </aside>
        ) : null}
      </div>
    </div>
  )
}
