# AI Usage headlines omit redundant quota labels

- **Status:** Accepted
- **Date:** 2026-10-14
- **Type:** View presentation
- **Supersedes:** —
- **Superseded by:** —

## Decision

Show the provider/account name and remaining percentage on one line, followed
by its quota bar and reset time. Omit the primary window label, including
“Weekly” and “Weekly (all models)”, and omit “left” after every percentage.
Keep provider icons, cached-data and error notices. Escalated secondary limits
keep their labels so the warning still identifies the limit involved.

## Context

The primary quota is already selected for each provider. Repeating the window
period and “all models” adds a redundant line and truncates in narrow rails.

## Why

The name, remaining percentage, bar and reset time are enough to read the
headline at a glance. Reclaim the removed line in the row budget while
retaining the existing primary-window selection and alert policy.

## Evidence

Owner, 2026-10-14, chat `4e7bae91-6265-4153-af51-31a857ad1d61`:

> I think just the model name + % (no "left") and the bar and the time it resets is enough.
