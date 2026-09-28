# A failed inventory read is the spools channels' fault, not the printers'

- **Status:** Accepted
- **Date:** 2026-09-28
- **Type:** source runtime / failure isolation
- **Supersedes:** —
- **Superseded by:** —

## Decision

In the Bambuddy source, a failed read of `/api/v1/inventory/spools` or
`/api/v1/inventory/assignments` is reported on the **spools** channels only
(`reportError`, `Bambuddy inventory: …`). The printers and cameras channels
keep publishing from the last good inventory, and the poll does not throw.

## Context

On 2026-09-28 Bambuddy's inventory endpoint answered `500 Internal Server
Error` for hours while its printer endpoints answered fine. The source read
the inventory unguarded when a spools channel existed (the workbench Filament
Spool Scale view), so the whole poll threw and `pollingSource` marked every
channel of the source in error, including `printers/live`. Every printer card
on every screen went dark for a fault in a list of spools.

## Why

A source serves several channels, and one endpoint's fault belongs to the
channels built from it. The printer card only *names a color* from the
inventory, which it can do from the last good read or not at all. The rule
that already covered the printers-only case ("a failed read is not an
outage") now covers the shared case too.

## Evidence

`bambuddy.test.ts`: "keeps publishing the printers when the inventory read
fails, and only the spools channel reports it". Live: `printers/live` in
`error` with `The source could not be reached or returned invalid data.` while
`curl …/api/v1/printers/2/status` returned `RUNNING` and
`…/api/v1/inventory/spools` returned 500 three times in a row.
