# Darker contrast keeps soft text and layered surfaces

Status: Accepted
Date: 2026-10-20
Type: Display appearance
Supersedes: None
Superseded by: None

## Decision

Add **Darker** between Standard and High in the per-display contrast setting and
live temporary-test controls. In dark mode it deepens the page and card backgrounds
while preserving standard soft foreground text, identity colors, and shaded layers.
It adds no high-contrast outlines. Light mode retains the standard palette.
Standard remains the default; choosing a profile affects only that installation.

## Context

An installation can make ordinary raised surfaces appear too bright, while the
pure-black, white-text High profile is too severe. The temporary comparison needs
a middle choice to evaluate on the actual panel.

## Why

Contrast is an installation preference, not a device-model special case. Darker
surfaces can improve content contrast but do not correct physical black levels,
viewing-angle brightness loss, or backlight behavior. Keep those observations separate
from whether CastKit delivered the selected palette correctly.

## Evidence

Owner: “This is too high-contrast, but we could try it. If I could swap between them
on the actual screen, that'd make it easier to test.” Then: “We can do a lightly
darker black. A lot of this on the device is too light-colored, and you don't get
enough contrast on this screen.” CastKit display review, 2026-10-20;
chat `t3-dfa7c37f`.

Extends [temporary tests and installation contrast](2026-10-20-displays-have-temporary-tests-and-installation-contrast.md).
