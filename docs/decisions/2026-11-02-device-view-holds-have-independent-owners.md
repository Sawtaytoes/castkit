# Device view holds have independent owners

Status: Accepted
Date: 2026-11-02
Type: Behavior
Supersedes: None
Superseded by: None

## Context

Independent callers can show the same saved composition on one display. A
view ID alone cannot identify both holds: a lower-priority manual request can
replace a longer alert, or dismissing either request can clear the other.

## Decision

Accept an optional `overrideId` on device override set and clear commands over
MQTT and the existing management HTTP endpoint. It is a nonempty string of at
most 128 characters. A named owner has one hold on a device, replacing its own
previous view. Clear matches both its view ID and owner ID, preserving a newer
view when an old dismissal arrives late.

Unnamed requests keep one hold per view and clear only the unnamed hold. Select
the winner by the existing priority and request order; retain each hold's own
expiry and navigation correlation. Owner IDs use the existing authorization
surface and grant no additional permissions.

## Why

Compositions can be shared without merging the lifetimes or interruption
policies of independent callers. Existing callers retain their behavior while
new callers can identify independent holds explicitly.

## Evidence

Override tests cover both dismissal directions, per-device isolation, expiry,
owner replacement across views, stale clears, and mixed MQTT/HTTP requests.
Invalid owner IDs are rejected before they can create or dismiss a hold.
