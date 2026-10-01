# Tally Marks is the app; Tally Marks Store is the shop

- **Status:** Accepted
- **Date:** 2026-10-01
- **Type:** Naming / integration
- **Supersedes:** —
- **Superseded by:** —

## Decision

The complete points, goals, streaks, rewards, and administration app is **Tally Marks**. Its child-facing shopping area is **Tally Marks Store**. The product identifier is `tally-marks`.

Rename the Tally Marks repository, packages, image, deployment, hostname, environment variables, and product-specific MQTT command topics together. Preserve the data and the shared `points/` ledger, scan, and state contracts. Historical decision records keep their original names and evidence.

CastKit's source, view catalogue, and configured points view labels use Tally Marks. Existing adapter, channel, and view identities remain stable so configured displays and access policies continue working.

## Context

The app grew from a rewards store into the entire points engine and progress system. The store is one part of that app.

## Why

The name captures accumulating earned progress. Naming the shop separately makes its place in the complete app clear.

## Evidence

Owner, this T3 Code naming conversation, 2026-10-01:

> Go ahead and do the full rename including fixing it in CastKit. [...] Points Market for the kids to buy sstuff is now Tally Marks Store. And Tally Marks is the entire app name itself.
