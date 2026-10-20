import type { ContractData } from "@castkit/sdk/contracts"
import type { BrowserClockConfig } from "@castkit/shared/protocol/ws"
import {
  formatClockDate,
  formatClockTimeParts,
  formatEventTime,
} from "../time.ts"
import { ClockReading } from "../views/ClockReading.tsx"

/** A distance-readable clock and agenda, with a live household points strip. */
export const IdleDashboard = ({
  now,
  clock,
  agenda,
  weather,
  points,
}: {
  now: number
  clock: BrowserClockConfig
  agenda?: ContractData["agenda.v1"]
  weather?: ContractData["weather.v1"]
  points?: ContractData["kids-points.v1"]
}) => {
  const events = (agenda?.events ?? [])
    .filter(
      (event) =>
        event.isAllDay || event.startMs >= now - 3600000,
    )
    .slice(0, 3)
  const kids = [...(points?.kids ?? [])].sort(
    (left, right) =>
      (left.displayOrder ?? Number.MAX_SAFE_INTEGER) -
      (right.displayOrder ?? Number.MAX_SAFE_INTEGER),
  )
  return (
    <div class="idle-dashboard-frame">
      <div
        class="idle-dashboard"
        data-has-points={String(kids.length > 0)}
      >
        <section
          class="idle-dashboard-clock"
          aria-label="Time and weather"
        >
          <ClockReading
            {...formatClockTimeParts(now, clock)}
            class="idle-dashboard-reading"
            timeClass="idle-dashboard-time"
            meridiemClass="idle-dashboard-meridiem"
          />
          <div class="idle-dashboard-date">
            {formatClockDate(now, clock)}
          </div>
          {weather ? (
            <div class="idle-dashboard-weather">
              <strong>{weather.temperatureText}</strong>
              <span>{weather.conditionText}</span>
            </div>
          ) : null}
        </section>
        <section
          class="idle-dashboard-agenda"
          aria-label="Today's agenda"
        >
          <h2>Today</h2>
          {events.length ? (
            <ul>
              {events.map((event) => (
                <li
                  key={`${event.startMs}:${event.summary}`}
                >
                  <time>
                    {formatEventTime({
                      startMillis: event.startMs,
                      isAllDay: event.isAllDay,
                      clock,
                    })}
                  </time>
                  <span>{event.summary}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p class="idle-dashboard-empty">
              Nothing else scheduled
            </p>
          )}
        </section>
        {kids.length ? (
          <section
            class="idle-dashboard-points"
            aria-label="Today's points"
          >
            {kids.map((kid) => (
              <article
                key={kid.id}
                aria-label={`${kid.name}'s points`}
                style={{
                  "--kid-color":
                    kid.color ?? "var(--accent)",
                }}
              >
                <div class="idle-dashboard-kid-header">
                  <h2>{kid.name}</h2>
                  <div class="idle-dashboard-score">
                    <strong>{kid.pointsToday}</strong>
                    {kid.goal ? (
                      <span>/ {kid.goal}</span>
                    ) : null}
                  </div>
                </div>
                {kid.goal ? (
                  <progress
                    aria-label={`${kid.name}'s daily goal`}
                    value={Math.min(
                      kid.goal,
                      Math.max(0, kid.pointsToday),
                    )}
                    max={kid.goal}
                  />
                ) : null}
                {kid.lastTask ? (
                  <p title={kid.lastTask}>{kid.lastTask}</p>
                ) : null}
              </article>
            ))}
          </section>
        ) : null}
      </div>
    </div>
  )
}
