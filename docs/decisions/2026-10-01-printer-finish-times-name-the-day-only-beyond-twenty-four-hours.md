# Printer finish times name the day only beyond twenty-four hours

- **Status:** Accepted
- **Date:** 2026-10-01
- **Type:** View / formatting
- **Supersedes:** [Calendar-day finish labels](2026-09-25-a-finish-time-names-its-day-when-it-is-not-today.md)
- **Superseded by:** —

## Decision

A predicted printer finish at most 24 hours away shows only its clock time,
even across midnight. Only a finish strictly more than 24 hours away gets a
day prefix: Tomorrow for the next calendar day, a weekday for two to six
calendar days ahead, and a date for a week or more ahead. Elapsed milliseconds
determine the threshold; the configured panel timezone determines the day name.
Historical ended-time labels retain their calendar-day behavior.

## Context

Short overnight prints showed Tomorrow solely because they crossed midnight.
The user explicitly corrected the previous calendar-day decision.

## Why

The remaining duration already describes short overnight jobs. Day prefixes
are reserved for predictions beyond the next twenty-four hours.

## Evidence

User, 2026-10-01: “CastKit only show "finishes Tomorrow" if it's more than 24h out, not if it's the next day.”

Chat: T3 Code thread associated with branch fix/finish-time-24h (chat ID unavailable).
