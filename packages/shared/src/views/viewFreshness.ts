import type { ViewName } from "./viewNames.ts"

/**
 * The shortest-lived value each view prints, in milliseconds.
 *
 * This is what the freshness rule tests a panel against. It is the SHORTEST
 * lifetime in the view, not an average: a view is only as fresh as the fastest
 * thing on it, so `Clock (Agenda)` is governed by its clock and not by its
 * agenda.
 *
 * ⚠️ Lifetime is how long the value stays TRUE, not how often it is recomputed.
 * A clock minute lives 60 s even though the clock ticks every second.
 */
export const VIEW_VALUE_LIFETIME_MILLISECONDS: Record<
  ViewName,
  number
> = {
  // Carries a clock, so the minute governs it.
  "Now Playing (Dashboard)": 60_000,
  // No clock. The current track is the shortest-lived value on it.
  "Now Playing (Poster)": 180_000,
  "Photo Frame": 3_600_000,
  "Photo Frame (Fill)": 3_600_000,
  "Photo Frame (Duo)": 3_600_000,
  // No wall clock. The photo and agenda both remain true for hours.
  "Photo Frame (Agenda)": 3_600_000,
  Clock: 60_000,
  "Clock (Weather)": 60_000,
  "Clock (Agenda)": 60_000,
  // The agenda changes when the calendar does, which is hours apart.
  Agenda: 3_600_000,
}
