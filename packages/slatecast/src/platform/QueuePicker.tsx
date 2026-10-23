import type { ContractData } from "@castkit/sdk/contracts"
import { useEffect, useRef, useState } from "preact/hooks"
import { useCompositionVisibility } from "./CompositionVisibility.ts"
import "./queuePicker.css"

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
      setRows(
        Math.max(
          1,
          Math.floor((element.clientHeight + 8) / 68),
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
          disabled={!isActive || !isControlEnabled}
          data-castkit-target="queue-picker:close"
          onClick={() => request("dismiss")}
        >
          Close
        </button>
      </header>
      <fieldset
        class="queue-picker-people"
        aria-label="Selected people"
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
            {person.name} ×
          </button>
        ))}
      </fieldset>
      <p class="queue-picker-hint">
        {!isActive
          ? "Scan a person card to begin."
          : error ||
            data.message ||
            "Scan more people, then tap a queue."}
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
                <span>{queue.title}</span>
                <span aria-hidden="true">▶</span>
              </button>
            ))}
        {isActive && !data.queues.length ? (
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
            ‹
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
            ›
          </button>
        </nav>
      </footer>
    </section>
  )
}
