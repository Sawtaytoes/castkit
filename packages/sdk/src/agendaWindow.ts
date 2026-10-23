import type { ContractData } from "./contracts.ts"

type AgendaEvent =
  ContractData["agenda.v1"]["events"][number]

/** A timed event stays on an agenda for an hour after it starts. */
export const STARTED_EVENT_GRACE_MILLISECONDS = 3_600_000

/**
 * The events an agenda still draws at `now`: every all-day event, and every
 * timed event that started less than an hour ago or has not started.
 *
 * The browser view filters with this, and the server reads the same rule to
 * know when time alone changes a captured agenda frame.
 */
export const getUpcomingAgendaEvents = ({
  events,
  now,
}: {
  events: readonly AgendaEvent[]
  now: number
}) =>
  events.filter(
    (event) =>
      event.isAllDay ||
      event.startMs >=
        now - STARTED_EVENT_GRACE_MILLISECONDS,
  )
