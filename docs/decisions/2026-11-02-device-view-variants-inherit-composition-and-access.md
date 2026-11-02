# Device view variants inherit composition and access

Status: Accepted
Date: 2026-11-02
Type: Architecture
Supersedes: None
Superseded by: None

## Context

Several installations can use the same composition while needing different
channel selections or panel settings. Copying a saved view for every device
causes the compositions to diverge and gives automations additional view IDs
to maintain. Shared rendering components remain plugins; a saved view records
an intended composition.

## Decision

Store optional `viewOverrides` in the existing installation definition, keyed
by saved view ID and existing panel ID. Permit input bindings, settings, and an
optional display name. Inherit layout, appearance, panel specifications,
access, and control permissions from the saved view. Removing a customization
restores inheritance; settings merge by field rather than recursively.

The shared view does not name devices. Its renderer still consumes declared
display properties and typed channels. Installation configuration resolves
customizations before channel selection, activity, actions, rendering, or
frame identity. Customizations do not create a separate saved view or URL.

Validate customizations before device persistence and check shared view,
channel, and plugin changes against existing customizations. Separate preview
profiles when customizations differ, and include the effective view and data
in frame identity so one installation cannot receive another's cached content.

Reader and timer scoping belongs in source channel settings. A shared last
scan cannot be filtered afterward to reconstruct an earlier scan in another
room.

## Why

Installation-specific inputs and settings should not require duplicate saved
compositions. Keeping permissions and structure inherited prevents a device
customization from changing the shared view's access policy or component types.

## Consequences

Shared changes propagate to inherited fields. An explicitly customized field
retains its value until reset. Renaming or removing a panel with a saved
customization requires resetting or updating that customization first. Device
editing remains the complete control surface and applies these edits live.

The [display platform guide](../display-platform.md#device-view-variants)
documents the editor and persisted format.

## Evidence

`deviceViewVariants.test.ts` exercises device-scoped snapshots, media, actions,
frame identity, shared updates, invalid edits, and scan expiry. The real-server
`deviceViewVariants.spec.ts` exercises two devices sharing a points composition
with independent readings and activity, live saving, reload, and reset in all
four named browser windows.
