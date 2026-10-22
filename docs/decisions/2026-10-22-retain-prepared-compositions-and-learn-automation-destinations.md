# Retain prepared compositions and learn automation destinations

Status: Accepted
Date: 2026-10-22
Type: Performance and interaction
Supersedes: None
Superseded by: None

## Decision

Extend background preparation to views assigned by automation. Remember up to eight
recent validated view IDs per device across server restarts. Remembering a destination
does not select it, restore an override, change its priority, bypass PIN protection,
or persist channel data. Assigned screen views remain candidates too.

Keep at most four safe built-in composition trees in the device document. Inactive
trees are invisible and inert, their clocks and resize observers pause, and only the
selected composition owns a subscription. Cameras, video panels and extension code
are not constructed in standby. Active render readiness and native touch targets
exclude standby content. Access invalidation immediately removes standby trees.
Single-frame captures and ordinary view links retain their existing lifecycle.

A return-to-time request also closes local child details in the main dashboard,
even when the server keeps that same view selected.

## Context

Preparing composition data eliminated bootstrap requests during measured warm
switches but did not eliminate slow construction and layout on a small browser.
Automation-only installations have no external-view list from which to prepare their
usual destinations. Both native browser and image-stream browser workers use the
same device shell.

## Why

Reuse removes repeat construction from navigation while keeping memory, background
work, authorization and invisible touch targets bounded. It extends the October 20
retained-content rule and October 22 data preparation rule without retaining hidden
browser documents, sockets, camera feeds or private data on disk.

## Evidence

Owner: "Maybe we can create a custom lazy-loaded page of all the assets, so they're
always there ready to go as soon as we switch screens."

Owner: "This loading issue also affects the ESP32 devices. I want everything to feel
near-instant speed."

Source: T3 Code navigation performance conversation, 2026-10-22.
