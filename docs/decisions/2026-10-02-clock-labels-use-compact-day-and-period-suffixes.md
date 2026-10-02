# Clock labels use compact day and period suffixes

- **Status:** Accepted
- **Date:** 2026-10-02
- **Type:** View formatting
- **Supersedes:** [Printer finish time threshold](2026-10-01-printer-finish-times-name-the-day-only-beyond-twenty-four-hours.md)
- **Superseded by:** —

## Decision

All CastKit view-generated twelve-hour times use a or p without a space:
5:01a, 11:56p. Twenty-four-hour times retain their configured format.
Predicted printer finish times at most 24 hours away show only the time,
even across midnight. Strictly beyond 24 hours, the next calendar day uses
T, later days use a weekday, and a week or more uses a date. Elapsed time
controls the threshold; the panel timezone determines the day.
Historical ended labels retain Yesterday and their calendar-day behavior.

## Context

Long Tomorrow and AM labels wrapped the finish metric onto another line.

## Why

Short suffixes keep the information readable in narrow composed cards and
make clock-bearing browser and server-rendered views consistent.

## Evidence

User, 2026-10-02: “We could probably shorten that to just `T 5:01a`.”
User: “And we don't need the full `AM`, just `a` is fine in all views.”

Chat: T3 Code thread associated with branch fix/layout-visibility
(chat ID unavailable).
