import type { ContractData } from "@castkit/sdk/contracts"
import { selectPanelData } from "@castkit/sdk/panelSelection"
import { useEffect, useRef, useState } from "preact/hooks"
import { ICON_PATHS, Icon } from "../Icon.tsx"
import { formatClockTime } from "../time.ts"
import { useDisplayProperties } from "./displayProperties.ts"
import {
  chooseTimerLayout,
  rankTimers,
} from "./timerLayout.ts"

type Entities = ContractData["entities.v1"]
/** Room timers share the priority policy while preserving source command revisions. */
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
  const timers = rankTimers(
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
          ) > now),
    ),
  )
  const hasControls =
    isControlEnabled && properties.isInteractive
  const layout = chooseTimerLayout({
    count: timers.length,
    ...size,
    hasControls,
  })
  const visible = timers.slice(0, layout?.visibleCount ?? 1)
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
  return (
    <div
      style={{
        height: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {error ? <p role="alert">{error}</p> : null}
      <div
        ref={container}
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        {timers.length > 0 ? (
          <div
            class="timer-priority-grid"
            style={{
              display: "grid",
              height: "100%",
              gap: 8,
              gridTemplateColumns: layout?.isRail
                ? `minmax(0, 2fr) minmax(${hasControls ? 180 : 140}px, 1fr)`
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
              const finish = Date.parse(
                String(entity.attributes.finishes_at),
              )
              const rawSeconds = Math.max(
                0,
                Math.ceil((finish - now) / 1000),
              )
              const remaining = properties.hasClockSeconds
                ? rawSeconds
                : Math.ceil(rawSeconds / 10) * 10
              return (
                <article
                  class="timer-priority-card"
                  key={entity.id}
                  style={{
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
                    containerType: "size",
                    minWidth: 0,
                    minHeight: 0,
                    padding: 8,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    gap: 4,
                    border: "1px solid currentColor",
                    borderRadius: 8,
                  }}
                >
                  <h2
                    title={entity.name}
                    style={{
                      margin: 0,
                      fontSize:
                        index === 0
                          ? "clamp(16px, 3cqw, 24px)"
                          : 16,
                      lineHeight: 1.2,
                      maxHeight: "2.4em",
                      overflow: "hidden",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {entity.name}
                  </h2>
                  <strong
                    role="timer"
                    style={{
                      fontSize:
                        index === 0
                          ? "clamp(26px, min(24cqw, 25cqh), 100px)"
                          : 24,
                      lineHeight: 1.1,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {entity.state === "active" &&
                    Number.isFinite(finish)
                      ? properties.repaint === "instant" ||
                        properties.repaint === "fast"
                        ? `${properties.hasClockSeconds ? "" : "~"}${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`
                        : `Ends ${formatClockTime(finish)}`
                      : String(
                          entity.attributes.remaining ?? "",
                        )}
                  </strong>
                  {entity.state === "paused" ? (
                    <small>Paused</small>
                  ) : null}
                  {hasControls ? (
                    <div
                      style={{ display: "flex", gap: 8 }}
                    >
                      {entity.actions
                        .filter((action) =>
                          [
                            "pause",
                            "cancel",
                            "add_5_minutes",
                            ...(entity.state === "paused"
                              ? ["start"]
                              : []),
                          ].includes(action),
                        )
                        .map((action) => (
                          <button
                            type="button"
                            aria-label={
                              action === "add_5_minutes"
                                ? "Add 5 minutes"
                                : action === "start"
                                  ? "Resume"
                                  : action === "pause"
                                    ? "Pause"
                                    : "Cancel"
                            }
                            title={
                              action === "add_5_minutes"
                                ? "Add 5 minutes"
                                : action === "start"
                                  ? "Resume"
                                  : action === "pause"
                                    ? "Pause"
                                    : "Cancel"
                            }
                            style={{
                              minHeight: 40,
                              minWidth: 40,
                              justifyContent: "center",
                              padding: "4px 8px",
                              fontSize: 14,
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                            disabled={busy === entity.id}
                            onClick={() =>
                              void change(entity.id, action)
                            }
                          >
                            <Icon
                              path={
                                action === "add_5_minutes"
                                  ? ICON_PATHS.plus
                                  : action === "pause"
                                    ? ICON_PATHS.pause
                                    : action === "start"
                                      ? ICON_PATHS.play
                                      : ICON_PATHS.stop
                              }
                            />
                            {(layout?.sections[index]
                              ?.width ?? size.width) >= 250
                              ? action === "add_5_minutes"
                                ? "5 min"
                                : action === "start"
                                  ? "Resume"
                                  : action === "pause"
                                    ? "Pause"
                                    : "Cancel"
                              : action === "add_5_minutes"
                                ? "5"
                                : null}
                          </button>
                        ))}
                    </div>
                  ) : null}
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
