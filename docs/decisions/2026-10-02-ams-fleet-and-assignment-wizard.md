# AMS fleet layouts and direct wizard navigation

- **Status:** Accepted
- **Date:** 2026-10-02
- **Type:** Product / UI
- **Supersedes:** None
- **Superseded by:** None

## Decision

Offer a dedicated read-only AMS view with refined slot cards for the whole fleet and spacious spool rows for one selected printer. Keep the original spool-row treatment; compact presentation is for constrained space. Narrow panels select a printer and AMS unit rather than clipping rows. Display temperature, humidity and K values only when the source supplies them, and distinguish empty slots from unknown quantities and unidentified spools.

Use a separate `ams.v1` contract so public filament viewing needs no management sign-in and exposes neither reader identifiers nor the full spool inventory. Assignment remains in the existing authorized spool view.

Assignment has numbered Printer, AMS and Slot stages. Completed stages are selectable directly and discard dependent selections. Printer selection includes the source's model product image. Charcuterie owns the shared progress logic and React Stepper behavior; the lightweight display client uses its own Preact presentation.

## Context

The design review approved refined slot cards, retained the original roomy spool rows, and requested direct step navigation and printer imagery.

## Why

A compact fleet overview lets people locate filament quickly. Roomy rows remain easier to read when focusing on one printer. Explicit wizard progress makes the assignment sequence discoverable.

## Evidence

Owner in the CastKit AMS design review, 2026-10-02: “Yes for the slot cards.” “For the spool rows, I still like this design.” “Instead of hitting ‘back’, I should be able to hit the ‘step’ at the top.” Reference attachments: `image_be8028e3-9c3b-4c0f-871e-617c4c66a7b9` and `image_9e2653c3-1561-46a9-919c-2ecaf2174a93`.
