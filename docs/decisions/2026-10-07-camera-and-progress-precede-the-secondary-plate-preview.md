# Camera and progress precede the secondary plate preview

- **Status:** Accepted
- **Date:** 2026-10-07
- **Type:** Layout / interaction
- **Supersedes:** [Priority-based printer section fit](2026-09-30-printer-layouts-fit-sections-in-priority-order.md), for simultaneous camera and plate-preview priorities.
- **Superseded by:** —

## Decision

A camera-enabled printer card retains its primary camera area and shows the actual plate cover as an expandable secondary thumbnail beside progress and details. Camera and progress have higher priority than the plate preview; the preview has higher priority than layers and current filament. Drop filament first, then layer details, then the plate preview as measured space runs out. Progress and available controls remain required. The existing measured camera orientation policy remains in force.

With cameras disabled, retain the existing full print image without duplicating a thumbnail. A missing plate cover adds no secondary image. No placeholder image replaces a camera.

## Context

Pull request #104 is closed. Its older visual comparison used an unavailable camera and an unrelated landscape fixture. A private review with actual camera and plate media established the intended camera-first layout. This change is a focused replacement for the secondary image only, without the old branch's four-or-more layouts.

## Why

The camera shows current print conditions and progress gives the essential status. The plate cover identifies what is being printed. Filament and layers are useful supporting details but can yield their space first.

## Evidence

Owner, T3 Code chat `t3code-58cf7887`, 2026-10-07:

> Looks good! Okay. I'm thinking that could work. It's a lower priority than the camera and progress but higher priority than the current filament and layers.

The review used real media privately; committed stories and tests retain synthetic fixtures.
