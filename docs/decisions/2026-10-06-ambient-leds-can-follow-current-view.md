# Ambient LEDs can follow the current view

Status: Accepted
Date: 2026-10-06
Type: Product behavior
Supersedes: None
Superseded by: None

## Decision

Supporting devices may opt into following the current view from the Ambient light tab.
Each offered builtin or platform view has an editable rule: one of the five effects or
Off. Builtin defaults are album glow for Now Playing, progress bar for Queue, meeting
fuse for Calendar, weather aura for Ambient/Clock/Weather, and swipe comet for Touch Test.
Other, unmapped and unavailable views keep the LEDs off. Platform compositions start
with Off unless explicitly configured.

Rules use `builtin:<clientId>` or `view:<platformViewId>` identities, never labels or
screen container IDs. Resolve the active temporary device override before its assigned
screen, and resolve that screen's actual selected view. CastKit resolves physical
power/effect before delivering controls; firmware still receives the same five modes.

Manual Off always wins. Following views preserves remembered brightness, demo preview
and the manual effect; disabling the policy restores that manual effect. Both power
buttons highlight and announce the effective state, including Off for a view rule.

## Context

A single manual effect requires repeated management changes when a display moves
between music, agenda and weather. The existing power button appearance always filled
On, even when Off was selected.

## Why

An optional device-local policy works without Home Assistant or a broker. Keeping stored
controls separate from resolved power/effect avoids replacing remembered settings when
a view intentionally keeps LEDs dark. Namespace separation prevents an unrelated custom
view from inheriting a builtin rule with a matching ID.

MQTT exposes `follow-view` alongside the five manual effects. That command enables the
policy; a manual effect disables it. Retained state reports the configured effect alias,
resolved power, `resolved_effect`, `followView` and `viewModes` from the same controller.
View changes update that state; metadata-only notifications do not publish duplicates.

## Evidence

The owner requested optional effects by current view and reported that Off did not
highlight when selected. Controller and integration tests cover manual priority,
persistence, MQTT transitions, active screen/override resolution and identity collisions.
Four-window management checks cover the actual power button fill and editable rules.
