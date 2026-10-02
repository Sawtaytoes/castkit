# Automatic compositions reclaim camera letterboxing

Status: Accepted
Date: 2026-10-01
Type: Layout
Supersedes: None
Superseded by: None

## Decision

Automatic considers measured supporting strips underneath printer cards as well as side rails. Budget only the quota rows selected for display, keep each provider's rows together, and include the panel's padding and borders. Generate a strip height from the cameras' contained aspect ratios and measured facts, alongside the minimum readable quota height and larger text candidates.

Preserve required content first, then apply each component's saved Composition priority using Charcuterie's shared layout policy. Camera scores use contained media area; AI scores use the readable text scale its actual row layout can support. Unused background space is not useful media area. Manual cards and rails remain available, and reflow keeps the mounted cameras and original action bindings.

The defaults remain printers 3, RipDeck 2 and other components 1. Priorities are editable per view component in management. Individual printer cards retain their separate camera-versus-facts policy.

## Context

A wide, short composition can contain three cameras with unused space above and below the images while its narrow AI rail leaves most of its height empty. A fixed minimum strip height and an estimate based on every source quota window made the bottom alternative look worse than it was.

## Why

Reclaim letterboxing when it improves useful camera area while keeping supporting data readable. Use the same selected rows and sizing contract as the AI renderer instead of treating text as an image with a fixed aspect ratio. Keep a side rail when one large camera benefits from it.

## Evidence

The owner requested: “Using the whole bottom area gives us more space to see the percentages left” and “ensuring priority items are first and secondary priority items are still visible.” Chat: 08aa412b-7bd8-47c5-b452-4085fc663efc. Deployment evidence and installation details are in the private household-display workspace.
