import type { ContractData } from "@castkit/sdk/contracts"
import { getCategoricalIndex } from "@charcuterie/tokens"
import { useEffect, useRef, useState } from "preact/hooks"
import { useCompositionVisibility } from "./CompositionVisibility.ts"
import { safeMediaUrl } from "./protocol.ts"
import "./queuePicker.css"

// Lucide paths, rendered inline to keep the display client dependency-free.
const iconPaths = {
  close: ["M18 6 6 18", "m6 6 12 12"],
  play: ["m6 3 14 9-14 9V3Z"],
  previous: ["m15 18-6-6 6-6"],
  next: ["m9 18 6-6-6-6"],
  reset: [
    "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8",
    "M3 3v5h5",
  ],
}
const QueuePickerIcon = ({
  name,
}: {
  name: keyof typeof iconPaths
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    {iconPaths[name].map((path) => (
      <path key={path} d={path} />
    ))}
  </svg>
)

const PersonAvatar = ({
  person,
}: {
  person: ContractData["queue-picker.v1"]["people"][number]
}) => {
  const [failedImageUrl, setFailedImageUrl] = useState("")
  const imageUrl = safeMediaUrl(person.artworkPath)
  const color = getCategoricalIndex(person.id)
  return (
    <span
      class="queue-picker-avatar"
      aria-hidden="true"
      style={{
        background: `var(--color-categorical-${color}-solid)`,
        color: `var(--color-categorical-${color}-on-solid)`,
      }}
    >
      {imageUrl && failedImageUrl !== imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          onError={() => setFailedImageUrl(imageUrl)}
        />
      ) : (
        person.name
          .trim()
          .split(/\s+/)
          .slice(0, 2)
          .map((part) => part.charAt(0))
          .join("")
          .toUpperCase()
      )}
    </span>
  )
}

/** A bounded, paged queue chooser. No queue is chosen by scanning a person. */
export const QueuePicker = ({
  data,
  now,
  isControlEnabled,
  onAction,
}: {
  data: ContractData["queue-picker.v1"]
  now: number
  isControlEnabled: boolean
  onAction: (
    action: string,
    payload?: Record<string, unknown>,
  ) => Promise<void>
}) => {
  const container = useRef<HTMLDivElement>(null)
  const lastTouch = useRef(0)
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState(1)
  const [error, setError] = useState("")
  const isVisible = useCompositionVisibility()
  const isActive = data.isActive && data.expiresAt > now
  useEffect(() => {
    setPage(0)
    setError("")
  }, [data.revision])
  useEffect(() => {
    const element = container.current
    if (!element) return
    const observer = new ResizeObserver(() => {
      // The list owns its remaining height, so no row is clipped on short panels.
      const styles = getComputedStyle(element)
      const rowHeight = Number.parseFloat(
        styles.getPropertyValue("--queue-row-height"),
      )
      const rowGap = Number.parseFloat(styles.rowGap)
      setRows(
        Math.max(
          1,
          Math.floor(
            (element.clientHeight + rowGap) /
              (rowHeight + rowGap),
          ),
        ),
      )
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const request = (
    action: string,
    payload: Record<string, unknown> = {},
  ) => {
    if (!isActive || !isControlEnabled || !isVisible) return
    void onAction(action, {
      ...payload,
      sessionId: data.sessionId,
      revision: data.revision,
    }).catch(() =>
      setError("Could not send that choice. Try again."),
    )
  }
  const touch = () => {
    if (Date.now() - lastTouch.current < 1000) return
    lastTouch.current = Date.now()
    request("touch")
  }
  const touchBackground = ({
    target,
  }: {
    target: EventTarget | null
  }) => {
    // Button actions already renew or close the selection. Starting a separate
    // request on pointer/key down locks the button before its click can run.
    if (
      target instanceof Element &&
      target.closest("button")
    )
      return
    touch()
  }
  const pages = Math.max(
    1,
    Math.ceil(data.queues.length / rows),
  )
  const visiblePage = Math.min(page, pages - 1)
  return (
    <section
      class="queue-picker"
      onPointerDown={touchBackground}
      onKeyDown={touchBackground}
      aria-label="Queue chooser"
    >
      <header>
        <h2>Choose a queue</h2>
        <button
          type="button"
          aria-label="Close"
          disabled={!isActive || !isControlEnabled}
          data-castkit-target="queue-picker:close"
          onClick={() => request("dismiss")}
        >
          <QueuePickerIcon name="close" />
        </button>
      </header>
      <fieldset
        class="queue-picker-people"
        aria-label="Selected people"
        data-castkit-target={`scroll:queue-people:${data.sessionId}:${data.revision}`}
        data-castkit-scroll="true"
        onPointerCancel={touch}
        onWheel={touch}
        onKeyDown={(event) => {
          if (
            [
              "ArrowUp",
              "ArrowDown",
              "PageUp",
              "PageDown",
              "Home",
              "End",
            ].includes(event.key)
          ) {
            touch()
          }
        }}
      >
        {data.people.map((person) => (
          <button
            key={person.id}
            type="button"
            disabled={!isActive || !isControlEnabled}
            aria-label={`Remove ${person.name}`}
            data-castkit-target={`queue-picker:person:${person.id}`}
            onClick={() =>
              request("remove", { personId: person.id })
            }
          >
            <PersonAvatar person={person} />
            <span class="queue-picker-person-name">
              {person.name}
            </span>
            <QueuePickerIcon name="close" />
          </button>
        ))}
      </fieldset>
      <p
        class="queue-picker-hint"
        role="status"
        aria-live="polite"
      >
        {!isActive
          ? "Scan a person card to begin."
          : error ||
            data.message ||
            "Scan more people to add them."}
      </p>
      <div class="queue-picker-list" ref={container}>
        {isActive &&
          data.queues
            .slice(
              visiblePage * rows,
              (visiblePage + 1) * rows,
            )
            .map((queue) => (
              <button
                type="button"
                key={queue.id}
                disabled={!isControlEnabled}
                data-castkit-target={`queue-picker:queue:${data.revision}:${queue.id}`}
                onClick={() =>
                  request("choose", { queueId: queue.id })
                }
              >
                <QueuePickerIcon name="play" />
                <span>{queue.title}</span>
              </button>
            ))}
        {isActive &&
        !data.queues.length &&
        !data.message &&
        !error ? (
          <p>
            No matching queues. Remove a person or scan
            another card.
          </p>
        ) : null}
      </div>
      <footer>
        <button
          type="button"
          disabled={!isActive || !isControlEnabled}
          data-castkit-target="queue-picker:reset"
          onClick={() => request("reset")}
        >
          <QueuePickerIcon name="reset" />
          Reset
        </button>
        <nav aria-label="Queue pages">
          <button
            type="button"
            aria-label="Previous queues"
            disabled={visiblePage === 0}
            data-castkit-target="queue-picker:previous"
            onClick={() => {
              setPage(visiblePage - 1)
              request("touch")
            }}
          >
            <QueuePickerIcon name="previous" />
          </button>
          <span>
            {visiblePage + 1} / {pages}
          </span>
          <button
            type="button"
            aria-label="Next queues"
            disabled={visiblePage + 1 >= pages}
            data-castkit-target="queue-picker:next"
            onClick={() => {
              setPage(visiblePage + 1)
              request("touch")
            }}
          >
            <QueuePickerIcon name="next" />
          </button>
        </nav>
      </footer>
    </section>
  )
}
