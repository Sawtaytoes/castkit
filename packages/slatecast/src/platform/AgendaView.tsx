import type { ContractData } from "@castkit/sdk/contracts"
import {
  useLayoutEffect,
  useRef,
  useState,
} from "preact/hooks"

/** The view budgets whole rows from its own panel, including its heading and overflow count. */
export const AgendaView = ({
  data,
  now,
}: {
  data: ContractData["agenda.v1"]
  now: number
}) => {
  const element = useRef<HTMLDivElement>(null)
  const [rowCount, setRowCount] = useState(1)
  useLayoutEffect(() => {
    const panel = element.current?.parentElement
    if (!panel) {
      return
    }
    const measure = () => {
      const style = getComputedStyle(panel)
      const available =
        panel.clientHeight -
        Number.parseFloat(style.paddingTop) -
        Number.parseFloat(style.paddingBottom)
      setRowCount(
        Math.max(0, Math.floor((available - 72) / 84)),
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(panel)
    return () => observer.disconnect()
  }, [])
  const upcoming = data.events.filter(
    (event) =>
      event.isAllDay || event.startMs >= now - 3_600_000,
  )
  const visible = upcoming.slice(0, rowCount)
  return (
    <div
      class="platform-agenda platform-agenda-fitted"
      ref={element}
    >
      <h2>Agenda</h2>
      {upcoming.length === 0 ? (
        <p>No upcoming events</p>
      ) : (
        visible.map((event, index) => (
          <article key={`${event.startMs}:${index}`}>
            <time
              dateTime={new Date(
                event.startMs,
              ).toISOString()}
            >
              {event.isAllDay
                ? "All day"
                : new Date(
                    event.startMs,
                  ).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
            </time>
            <h3>{event.summary}</h3>
          </article>
        ))
      )}
      {upcoming.length > rowCount ? (
        <p class="platform-agenda-more">
          {upcoming.length - rowCount} more events
        </p>
      ) : null}
    </div>
  )
}
