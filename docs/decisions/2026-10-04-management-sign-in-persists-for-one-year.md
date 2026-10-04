# Management sign-in persists for one year

- **Status:** Accepted
- **Date:** 2026-10-04
- **Type:** Access
- **Supersedes:** [Public printer views use shared management sign-in](2026-09-30-public-printer-views-use-shared-management-sign-in.md) (management session lifetime only)
- **Superseded by:** —

## Decision

Management sign-in lasts one year in the same browser. Its persistent cookie and
server-side expiry use the same lifetime. Sessions survive server restarts through
the existing persisted platform store. Sign-out and PIN changes still revoke access;
view-specific PIN grants retain their configured lifetimes. Existing cookies need
one fresh sign-in to receive the longer lifetime.

## Context

The fixed twelve-hour management session forced repeated PIN entry each day.

## Why

Management sign-in should be retained across daily visits, like the existing
persistent viewing sessions, without removing server-side authorization or revocation.

## Evidence

Owner, current T3 Code conversation, 2026-10-04:
“I don't wanna keep signing into CastKit every day, but I keep having to re-enter my PIN for some reason.”

Regression tests verify next-day authentication after restoring the store, eventual
expiry, sign-out, and PIN-change revocation.
