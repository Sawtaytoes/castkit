# Routine device settings apply live without a server restart

Status: Accepted
Date: 2026-10-22
Type: Interaction and runtime configuration
Supersedes: None
Superseded by: None

## Decision

Saving an existing display's ordinary presentation and view settings updates the
running definition and affected display. Names, contrast, navigation, view lists,
rotation, repaint properties and supported channel bindings do not restart CastKit
or its image-stream workers. Keep the existing explicit Save action for drafts;
controls already designed to apply immediately continue to do so.

Registry, transport, renderer, capability wiring and capture-viewport changes can
still require runtime reinitialization. Explain that before saving, return an
explicit `isRestarting` result, and recover the management page and preview
automatically when the service returns. A successful save must not leave the editor
permanently disabled or require the owner to reload it manually.

Validate saved definitions with the startup schema before persistence. Complete the
persistent write before updating the live registry; a failed write leaves the prior
configuration active. Refresh discovery metadata without changing entity identity.

## Context

Every device-definition save previously scheduled SIGTERM for the entire server.
That interrupted unrelated browser displays and every managed image-stream worker,
even for a name or contrast change. The editor set a restart-pending flag that only
manual reload cleared. This made a settings save look like a failed page.

## Why

These settings are data consumed by existing runtimes. Updating those references
and pushing their new snapshots avoids a process outage and preserves the page,
connections, worker sessions and loaded assets during routine edits.

## Evidence

Owner: "Most of these settings could just be saved or changed in realtime without
needing to restart the device."

Owner: "if I hit Save & Restart here ... it never comes back. This page basically
fails."

Source: T3 Code navigation performance and device-settings conversation, 2026-10-22.
