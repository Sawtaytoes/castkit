import type { ContractData } from "@castkit/sdk/contracts"
import { useRef, useState } from "preact/hooks"
import { formatClockTime } from "../time.ts"
import { formatPointsDelta } from "./kidsPointsLayout.ts"

type KidEntry =
  ContractData["kids-points.v1"]["kids"][number]

/** Calendar days follow the producer's timezone, with the browser as a safe fallback. */
export const getTaskDay = ({
  atMs,
  timeZone,
}: {
  atMs: number
  timeZone?: string
}) => {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(atMs))
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(atMs))
  }
}

/** A read-only daily task list; the total remains the producer's authoritative value. */
export const KidTasksToday = ({
  kid,
  now,
  onBack,
}: {
  kid: KidEntry
  now: number
  onBack: () => void
}) => {
  const [selectedTaskName, setSelectedTaskName] = useState<
    string | undefined
  >()
  const contact = useRef<
    | {
        pointerId: number
        startX: number
        startY: number
        scrollTop: number
      }
    | undefined
  >()
  const hasDragged = useRef(false)
  const today = getTaskDay({
    atMs: now,
    timeZone: kid.timeZone,
  })
  const isPreviousDay =
    kid.day !== undefined && kid.day !== today
  const tasks = isPreviousDay
    ? []
    : (kid.tasksToday ?? [])
        .filter(
          (task) =>
            getTaskDay({
              atMs: task.atMs,
              timeZone: kid.timeZone,
            }) === today,
        )
        .toSorted(
          (left, right) =>
            right.atMs - left.atMs ||
            left.id.localeCompare(right.id),
        )
  const active = isPreviousDay ? undefined : kid.activeTask
  const taskNames = Array.from(
    new Set([
      ...(active ? [active.name] : []),
      ...tasks.map((task) => task.name),
    ]),
  )
  const summaries = taskNames.map((name) => {
    const entries = tasks.filter(
      (task) => task.name === name,
    )
    return {
      name,
      entries,
      points: entries.reduce(
        (total, task) => total + task.points,
        0,
      ),
      minutes: entries.some(
        (task) => task.minutes !== undefined,
      )
        ? entries.reduce(
            (total, task) => total + (task.minutes ?? 0),
            0,
          )
        : undefined,
      active: active?.name === name ? active : undefined,
    }
  })
  const selected = summaries.find(
    (summary) => summary.name === selectedTaskName,
  )
  const visibleTasks = selected?.entries ?? tasks
  const visibleActive = selected ? selected.active : active
  const hasHistory = kid.tasksToday !== undefined
  const hasActivity =
    tasks.length > 0 || active !== undefined
  const time = (atMs: number) =>
    formatClockTime(atMs, {
      timeZone: kid.timeZone,
      isTwelveHour: true,
      isNumericDate: false,
    })
  const scanCount = (count: number) =>
    `${count} ${count === 1 ? "scan" : "scans"}`
  const summaryText = (
    summary: (typeof summaries)[number],
  ) =>
    !hasHistory
      ? "Task history unavailable"
      : [
          summary.minutes === undefined
            ? undefined
            : `${summary.minutes.toLocaleString("en-US")} min total`,
          scanCount(summary.entries.length),
        ]
          .filter((text) => text !== undefined)
          .join(" · ")
  return (
    <section
      class="kids-points-tasks"
      aria-label={`${kid.name}'s tasks today`}
    >
      <header class="kids-points-tasks-header">
        <button
          type="button"
          class="kids-points-back"
          aria-label={
            selected
              ? "Back to today's tasks"
              : "Back to all children"
          }
          data-castkit-target={`kids-points-back:${kid.id}:${selected ? "tasks" : "board"}`}
          onClick={() => {
            if (selected) {
              setSelectedTaskName(undefined)
            } else {
              onBack()
            }
          }}
        >
          ‹
        </button>
        <h2 title={kid.name}>{kid.name}</h2>
        <p>
          <strong>
            {selected
              ? hasHistory
                ? formatPointsDelta(selected.points)
                : "—"
              : kid.pointsToday.toLocaleString("en-US")}
          </strong>
          <span>today</span>
        </p>
      </header>
      <div class="kids-points-tasks-heading">
        <h3>{selected?.name ?? "Today's tasks"}</h3>
        {hasHistory && !isPreviousDay ? (
          <span>
            {selected
              ? summaryText(selected)
              : `${summaries.length} ${summaries.length === 1 ? "task" : "tasks"}`}
          </span>
        ) : null}
      </div>
      {hasActivity ? (
        // biome-ignore lint/a11y/noNoninteractiveTabindex: The scroll region needs keyboard scrolling.
        <section
          key={selected?.name ?? "summary"}
          class="kids-points-task-list"
          aria-label={
            selected
              ? `Scroll ${selected.name} scans`
              : "Scroll today's tasks"
          }
          data-castkit-target={`scroll:kids-points-tasks:${kid.id}:${selected ? encodeURIComponent(selected.name) : "summary"}`}
          data-castkit-scroll="true"
          onPointerDown={(event) => {
            event.stopPropagation()
            hasDragged.current = false
            contact.current = {
              pointerId: event.pointerId,
              startX: event.clientX,
              startY: event.clientY,
              scrollTop: event.currentTarget.scrollTop,
            }
          }}
          onPointerMove={(event) => {
            event.stopPropagation()
            if (
              contact.current?.pointerId === event.pointerId
            ) {
              if (
                Math.max(
                  Math.abs(
                    contact.current.startX - event.clientX,
                  ),
                  Math.abs(
                    contact.current.startY - event.clientY,
                  ),
                ) > 8
              ) {
                hasDragged.current = true
                event.currentTarget.setPointerCapture(
                  event.pointerId,
                )
              }
              if (hasDragged.current) {
                event.currentTarget.scrollTop =
                  contact.current.scrollTop +
                  contact.current.startY -
                  event.clientY
              }
            }
          }}
          onPointerUp={(event) => {
            event.stopPropagation()
            contact.current = undefined
          }}
          onPointerCancel={(event) => {
            event.stopPropagation()
            hasDragged.current = true
            contact.current = undefined
          }}
        >
          {!selected
            ? summaries.map((summary) => (
                <button
                  type="button"
                  class="kids-points-task kids-points-task-summary"
                  key={summary.name}
                  aria-label={`View ${summary.name} scans`}
                  data-castkit-target={`kids-points-task:${kid.id}:${encodeURIComponent(summary.name)}`}
                  onKeyDown={() => {
                    hasDragged.current = false
                  }}
                  onClick={() => {
                    if (!hasDragged.current) {
                      setSelectedTaskName(summary.name)
                    }
                  }}
                >
                  <div>
                    <h4>{summary.name}</h4>
                    <p>{summaryText(summary)}</p>
                    {summary.active ? (
                      <p>
                        In progress since{" "}
                        {time(summary.active.startedAtMs)}
                      </p>
                    ) : null}
                  </div>
                  {hasHistory ? (
                    <strong>
                      {formatPointsDelta(summary.points)}
                    </strong>
                  ) : null}
                  <span aria-hidden="true">›</span>
                </button>
              ))
            : null}
          {selected && visibleActive ? (
            <article
              class="kids-points-task"
              data-running="true"
            >
              <div>
                <h4>{visibleActive.name}</h4>
                <p>
                  In progress since{" "}
                  {time(visibleActive.startedAtMs)}
                </p>
              </div>
            </article>
          ) : null}
          {selected
            ? visibleTasks.map((task) => (
                <article
                  class="kids-points-task"
                  key={task.id}
                  data-task-id={task.id}
                >
                  <div>
                    <h4>{task.name}</h4>
                    <p>
                      <time
                        dateTime={new Date(
                          task.atMs,
                        ).toISOString()}
                      >
                        {time(task.atMs)}
                      </time>
                      {task.minutes === undefined ||
                      task.minutes === 0
                        ? null
                        : ` · ${task.minutes.toLocaleString("en-US")} min`}
                    </p>
                  </div>
                  <strong>
                    {formatPointsDelta(task.points)}
                  </strong>
                </article>
              ))
            : null}
        </section>
      ) : (
        <div class="kids-points-tasks-empty" role="status">
          <h3>
            {isPreviousDay
              ? "Waiting for today's tasks"
              : hasHistory
                ? "No tasks scanned today"
                : "Task history unavailable"}
          </h3>
          <p>
            {isPreviousDay
              ? "Today's activity will appear when the points service updates."
              : hasHistory
                ? "Completed tasks will appear here as they are scanned."
                : "The points service has not sent today's task list yet."}
          </p>
        </div>
      )}
    </section>
  )
}
