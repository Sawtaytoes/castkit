import type { ContractData } from "@castkit/sdk/contracts"
import { selectPanelData } from "@castkit/sdk/panelSelection"
import { useEffect, useRef, useState } from "preact/hooks"
import { ICON_PATHS, Icon } from "../Icon.tsx"
import { formatClockTime } from "../time.ts"
import { useDisplayProperties } from "./displayProperties.ts"
import {
  assignTimerHues,
  chooseTimerLayout,
  getTimerBaseId,
  getTimerFraction,
  keepCancelingPlaces,
  rankTimers,
  TIMER_HUE_COUNT,
} from "./timerLayout.ts"

type Entities = ContractData["entities.v1"]
type TimerEntity = Entities["entities"][number]

const ACTION_LABELS: Record<string, string> = {
  pause: "Pause",
  start: "Resume",
  add_5_minutes: "Add 5 minutes",
  cancel: "Cancel",
}

/** The timer's own name, and the room it was set for when the source names one. */
const getTitles = (entity: TimerEntity) => {
  const label = entity.attributes.label
  if (typeof label !== "string")
    return { title: entity.name, room: null }
  // A source that sends a label names the entity "<label> · <room>".
  const parts = entity.name.split(" · ")
  return {
    title: label || parts[0] || entity.name,
    room: parts.length > 1 ? (parts.at(-1) ?? null) : null,
  }
}

/**
 * Room timers, drawn to be read across a room: each timer is a card whose
 * color drains as its time runs down. Cards keep their place in deadline
 * order, and a cancelled timer holds its card as an Undo button until the
 * source's undo window closes, so a second tap can't land on another timer.
 */
export const PriorityTimersView = ({
  data,
  now,
  settings,
  isControlEnabled,
  onAction,
}: {
  data: Entities
  now: number
  settings: Record<string, unknown>
  isControlEnabled: boolean
  onAction: (
    action: string,
    payload?: Record<string, unknown>,
  ) => Promise<void>
}) => {
  const properties = useDisplayProperties()
  const container = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [error, setError] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  useEffect(() => {
    const element = container.current
    if (!element) return
    const measure = () =>
      setSize({
        width: element.clientWidth,
        height: element.clientHeight,
      })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  // The last order on screen, so a cancelled timer's Undo card keeps its place.
  const order = useRef<string[]>([])
  const ranked = rankTimers(
    (
      selectPanelData({
        specId: "timers",
        settings,
        data,
      }) as Entities
    ).entities.filter(
      (entity) =>
        entity.state === "paused" ||
        (entity.state === "active" &&
          Date.parse(
            String(entity.attributes.finishes_at),
          ) > now) ||
        (entity.state === "canceling" &&
          Date.parse(String(entity.attributes.cancels_at)) >
            now),
    ),
  )
  const timers = keepCancelingPlaces(ranked, order.current)
  order.current = timers.map((entity) =>
    getTimerBaseId(entity.id),
  )
  const hasControls =
    isControlEnabled && properties.isInteractive
  const layout = chooseTimerLayout({
    count: timers.length,
    ...size,
    hasControls,
  })
  const visible = timers.slice(0, layout?.visibleCount ?? 1)
  const hues = assignTimerHues(
    visible.map((entity) => entity.id),
  )
  // A panel that can't show every second counts in ten-second steps.
  const step = properties.hasClockSeconds ? 1 : 10
  const roundUp = (milliseconds: number) =>
    Math.ceil(Math.max(0, milliseconds) / 1000 / step) *
    step
  const change = async (
    entityId: string,
    action: string,
  ) => {
    setBusy(entityId)
    setError("")
    try {
      await onAction(action, { entityId })
    } catch {
      setError(
        "Timer command failed. Check the timer before trying again.",
      )
    } finally {
      setBusy(null)
    }
  }
  const isCountdownFresh =
    properties.repaint === "instant" ||
    properties.repaint === "fast"
  return (
    <div class="timer-priority">
      {error ? <p role="alert">{error}</p> : null}
      <div ref={container} class="timer-priority-area">
        {timers.length > 0 ? (
          <div
            class="timer-priority-grid"
            style={{
              gridTemplateColumns: layout?.isRail
                ? `minmax(0, 2fr) minmax(${hasControls ? 200 : 140}px, 1fr)`
                : `repeat(${layout?.columns ?? 1}, minmax(0, 1fr))`,
              gridTemplateRows: layout?.isRail
                ? `repeat(${visible.length - 1}, minmax(0, 1fr))`
                : layout?.columns === 1
                  ? visible.length === 1
                    ? "minmax(0, 1fr)"
                    : `${layout.firstHeight}px repeat(${visible.length - 1}, minmax(0, 1fr))`
                  : `repeat(${Math.ceil(visible.length / (layout?.columns ?? 1))}, minmax(0, 1fr))`,
            }}
          >
            {visible.map((entity, index) => {
              const { title, room } = getTitles(entity)
              const finish = Date.parse(
                String(entity.attributes.finishes_at),
              )
              const isCanceling =
                entity.state === "canceling"
              const isPaused = entity.state === "paused"
              const remaining = roundUp(finish - now)
              const fraction = getTimerFraction(entity, now)
              const placement = {
                gridColumn: layout?.isRail
                  ? index === 0
                    ? "1"
                    : "2"
                  : undefined,
                gridRow: layout?.isRail
                  ? index === 0
                    ? `1 / span ${visible.length - 1}`
                    : String(index)
                  : undefined,
              }
              if (isCanceling) {
                const cancelsAt = Date.parse(
                  String(entity.attributes.cancels_at),
                )
                return (
                  <article
                    class="timer-priority-card timer-priority-card-canceling"
                    key={entity.id}
                    style={placement}
                  >
                    <div class="timer-priority-body">
                      <h2 title={title}>{title}</h2>
                      <span class="timer-priority-chip timer-priority-chip-status">
                        Cancelled
                      </span>
                      {hasControls &&
                      entity.actions.includes(
                        "undo_cancel",
                      ) ? (
                        <button
                          type="button"
                          class="timer-priority-undo"
                          aria-label={`Undo cancel of ${title}`}
                          disabled={busy === entity.id}
                          onClick={() =>
                            void change(
                              entity.id,
                              "undo_cancel",
                            )
                          }
                        >
                          <Icon path={ICON_PATHS.undo} />
                          <span>Undo</span>
                        </button>
                      ) : null}
                      <p class="timer-priority-gone">
                        {`Gone in ${roundUp(cancelsAt - now)} seconds`}
                      </p>
                      <div
                        class="timer-priority-undo-bar"
                        aria-hidden="true"
                      >
                        <i
                          style={{
                            width: `${Math.min(100, Math.max(0, ((cancelsAt - now) / 30000) * 100))}%`,
                          }}
                        />
                      </div>
                    </div>
                  </article>
                )
              }
              return (
                <article
                  class={`timer-priority-card timer-hue-${isPaused ? "paused" : (hues.get(entity.id) ?? 0) % TIMER_HUE_COUNT}`}
                  key={entity.id}
                  style={placement}
                >
                  <div
                    class="timer-priority-fill"
                    aria-hidden="true"
                    style={{ height: `${fraction * 100}%` }}
                  />
                  <div class="timer-priority-body">
                    <h2 title={title}>{title}</h2>
                    {isPaused || room ? (
                      <div class="timer-priority-chips">
                        {isPaused ? (
                          <span class="timer-priority-chip timer-priority-chip-status">
                            Paused
                          </span>
                        ) : null}
                        {room ? (
                          <span class="timer-priority-chip timer-priority-chip-room">
                            {room}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    <strong
                      role="timer"
                      class="timer-priority-digits"
                    >
                      {entity.state === "active" &&
                      Number.isFinite(finish)
                        ? isCountdownFresh
                          ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`
                          : formatClockTime(finish)
                        : formatRemaining(
                            String(
                              entity.attributes.remaining ??
                                "",
                            ),
                          )}
                    </strong>
                    {entity.state === "active" &&
                    Number.isFinite(finish) ? (
                      <p class="timer-priority-ends">
                        {isCountdownFresh
                          ? `Ends ${formatClockTime(finish)}`
                          : "Ends at this time"}
                      </p>
                    ) : null}
                    {hasControls ? (
                      <div class="timer-priority-controls">
                        {[
                          ...(entity.state === "paused"
                            ? ["start"]
                            : ["pause"]),
                          "add_5_minutes",
                          "cancel",
                        ]
                          .filter((action) =>
                            entity.actions.includes(action),
                          )
                          .map((action) => (
                            <button
                              type="button"
                              class={`timer-priority-button timer-priority-button-${action}`}
                              aria-label={
                                ACTION_LABELS[action]
                              }
                              title={ACTION_LABELS[action]}
                              key={action}
                              disabled={busy === entity.id}
                              onClick={() =>
                                void change(
                                  entity.id,
                                  action,
                                )
                              }
                            >
                              {action ===
                              "add_5_minutes" ? (
                                <span>
                                  <Icon
                                    path={ICON_PATHS.plus}
                                  />
                                  5
                                </span>
                              ) : (
                                <Icon
                                  path={
                                    action === "pause"
                                      ? ICON_PATHS.pause
                                      : action === "start"
                                        ? ICON_PATHS.play
                                        : ICON_PATHS.close
                                  }
                                />
                              )}
                            </button>
                          ))}
                      </div>
                    ) : null}
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <div class="platform-empty">
            <h2>No active timers</h2>
          </div>
        )}
      </div>
    </div>
  )
}

/** "0:12:30" from the source reads as "12:30"; anything else is shown as sent. */
const formatRemaining = (value: string) => {
  const match = /^(\d+):(\d{2}):(\d{2})$/.exec(value)
  if (!match) return value
  const hours = Number(match[1])
  return hours > 0
    ? `${hours}:${match[2]}:${match[3]}`
    : `${Number(match[2])}:${match[3]}`
}
