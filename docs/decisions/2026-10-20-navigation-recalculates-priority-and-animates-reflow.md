# Navigation recalculates priority and animates reflow

Status: Accepted
Date: 2026-10-20
Type: Display presentation and interaction
Supersedes: None
Superseded by: None

## Decision

An interaction that opens another screen or detail changes the active task. Recalculate
layout from that task's priority, then animate the reflow into the new arrangement.
Back applies the same rule when restoring the overview. Respect reduced motion and
the effective repaint grade, including battery-powered installations.

For child and task drilldowns, the detail gets full available height and a readable
column first. Keep the selected AI usage numbers alongside it when they all fit at
normal readable scale; otherwise hide that supporting panel for the visit. Fit uses
available dimensions and selected quota rows, not a device name. A 1024×600 composition
can keep the rail; a 480×480 composition gives the detail the full area.

Use the existing composition measurements and AI row budget. Keep mounted panels and
selected task state through reflow, and bound the detail's reading width on large
screens. The shared composition navigation interface is reusable by other drilldowns;
this change wires child → task totals → scans and both Back steps into it.

## Context

The full child board opened a vertical task list inside a wide, shallow cell. Compact
summary strips already expanded child details, but always covered the composition.
Neither behavior expressed the active task's priority while retaining secondary facts
when there was space for them.

## Why

Readable detail is the primary requirement. Secondary information stays useful when
it fits without competing for that space. Animated geometry connects the selected
card with its detail instead of abruptly replacing the layout. Reduced-motion and
slow-repaint displays receive the same final layout without that animation.

## Evidence

Owner, T3 Code chat `0d419ea4-29f8-4ab7-a743-f4613e46cad5`, 2026-10-20:

> This is a priority thing. So technically, if the AI numbers fit, keep them on the side; otherwise, hide them with the full view. That's what we do on the Presto screens, but 1024x600 has more space.

> When doing an action on a screen that results in opening another screen, we should definitely recalculate rendering based on priority and re-render from there with animation. That way, it's not a stark difference.

Browser coverage exercises full cards and compact summaries, both Back levels,
retained selection through resizing, quota overflow, reduced motion and slow repaint.
Fixture captures cover 1024×600, 1024×547, 480×480 and 384×824.

Rendered evidence from fictional data:

- [Before: compact-summary detail covers the composition](../images/navigation-priority/before-busy-detail.png).
- [After: the same visit retains fitting AI usage](../images/navigation-priority/after-busy-detail.png).
- [1024×600 detail with AI](../images/navigation-priority/detail-1024x600.png).
- [480×480 full-area detail](../images/navigation-priority/detail-480x480.png).
