import type { ContractData } from "@castkit/sdk/contracts"
import { useRef } from "preact/hooks"
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
  const contact = useRef<
    | {
        pointerId: number
        startY: number
        scrollTop: number
      }
    | undefined
  >()
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
  const active = kid.activeTask
  const hasHistory = kid.tasksToday !== undefined
  const hasActivity =
    tasks.length > 0 || active !== undefined
  const time = (atMs: number) =>
    formatClockTime(atMs, {
      timeZone: kid.timeZone,
      isTwelveHour: true,
      isNumericDate: false,
    })
  return (
    <section
      class="kids-points-tasks"
      aria-label={`${kid.name}'s tasks today`}
    >
      <header class="kids-points-tasks-header">
        <button
          type="button"
          class="kids-points-back"
          aria-label="Back to all children"
          data-castkit-target={`kids-points-back:${kid.id}`}
          onClick={onBack}
        >
          ‹
        </button>
        <h2 title={kid.name}>{kid.name}</h2>
        <p>
          <strong>
            {kid.pointsToday.toLocaleString("en-US")}
          </strong>
          <span>today</span>
        </p>
      </header>
      <div class="kids-points-tasks-heading">
        <h3>Today's tasks</h3>
        {hasHistory && !isPreviousDay ? (
          <span>
            {tasks.length}{" "}
            {tasks.length === 1 ? "entry" : "entries"}
          </span>
        ) : null}
      </div>
      {hasActivity ? (
        // biome-ignore lint/a11y/noNoninteractiveTabindex: The scroll region needs keyboard scrolling.
        <section
          class="kids-points-task-list"
          aria-label="Scroll today's tasks"
          data-castkit-target={`scroll:kids-points-tasks:${kid.id}`}
          data-castkit-scroll="true"
          onPointerDown={(event) => {
            event.stopPropagation()
            contact.current = {
              pointerId: event.pointerId,
              startY: event.clientY,
              scrollTop: event.currentTarget.scrollTop,
            }
            event.currentTarget.setPointerCapture(
              event.pointerId,
            )
          }}
          onPointerMove={(event) => {
            event.stopPropagation()
            if (
              contact.current?.pointerId === event.pointerId
            ) {
              event.currentTarget.scrollTop =
                contact.current.scrollTop +
                contact.current.startY -
                event.clientY
            }
          }}
          onPointerUp={(event) => {
            event.stopPropagation()
            contact.current = undefined
          }}
          onPointerCancel={(event) => {
            event.stopPropagation()
            contact.current = undefined
          }}
        >
          {active ? (
            <article
              class="kids-points-task"
              data-running="true"
            >
              <div>
                <h4>{active.name}</h4>
                <p>
                  In progress since{" "}
                  {time(active.startedAtMs)}
                </p>
              </div>
            </article>
          ) : null}
          {tasks.map((task) => (
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
          ))}
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
