# Combined kiosks share space by nested priority

Status: Accepted
Date: 2026-10-01
Type: Product and layout
Supersedes: None
Superseded by: None

## Decision

Offer Automatic plus manual cards and camera-rail compositions. Automatic measures the composition and uses Charcuterie's `selectPriorityLayout`: preserve required content, then maximize useful area in descending priority order. Printer cameras lead by default, followed by disc jobs and AI usage. Each printer independently applies its existing media-versus-facts priorities inside the allocated cell. Controls keep their touch target floor and stop growing.

Individual printers retain their DOM and original action binding across composition reflows. Account sections choose their own column count and type size from their allocated space; a tall AI rail stacks accounts vertically. Compact printer facts and accessible SVG Pause/Resume/Stop controls beside progress are available as view settings.

Saved components select printers, bays, AI accounts and usage windows independently of shared channels. Selection can explicitly be empty. Positive-only AI usage hides zero and unreported percentages. An optional quota replacement shows the aggregate weekly window normally, replacing it with a shorter limit only above the configured alert threshold. Poster presentation gives active Rip Deck bays the available media space and reports cards that do not fit rather than cutting them off.

## Context

A camera rail works particularly well for one printer. Several cameras benefit from cards. Fixed equal partitions and a fixed two-column AI layout waste useful space when activity changes.

## Why

The same priority policy can act at the composition, printer-group and individual-card levels without adding a separate layout framework. Manual choices remain available. Per-view selection lets different kiosks share sources while showing different subsets.

## Evidence

The owner requested: “the printer view is important; highest priority, and then we render the AI usage off that” and described priorities within a single printer, a group, and multiple data types. The owner accepted both card and rail layouts and requested icon controls beside the percentage.
