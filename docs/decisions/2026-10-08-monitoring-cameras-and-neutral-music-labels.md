# Monitoring cameras receive the space; music labels stay neutral

Status: Accepted
Date: 2026-10-08
Type: Owner preference
Supersedes: None
Superseded by: None

## Decision

In camera-focused compositions, bound compact printer typography and controls by their own card. Keep required progress, printer identity, job and actions readable. Rearrange compact facts beside one another on wide cards before sacrificing media space. A supporting AI usage strip reaches its normal readable size, then spare area belongs to the cameras. A deliberately higher usage priority may still enlarge usage. Explicit rail layouts remain available.

Expose active-filament visibility as a printer view setting, defaulting to visible. A camera-focused monitoring view can omit this row. Measure candidate facts using the same container geometry and styling as the rendered card, including browser zoom.

Music seek and volume sliders continue using colors sampled from album artwork. Time labels and volume icons use their previous gray/white theme colors, including pressed icons.

## Context

The owner showed a landscape monitoring view with large facts, small contained cameras, and AI usage beside the printers. Browser zoom was above 100%; at 75% the cameras became the feature. Manual zoom exposed a layout and content-sizing problem.

## Why

Camera size is the purpose of monitoring. Compact supporting text and a measured bottom strip retain information while leaving cameras useful without expansion. Arbitrarily enlarging supporting text to fill an empty rectangle reverses that purpose. Browser zoom remains a user preference and all fit budgets use CSS pixels.

## Evidence

Owner, T3 Code thread `13663723-6fe7-4a1b-9fe0-547a994e861d`, 2026-10-08:

> "But the AI usage stats are next to the prints, not below"

> "You can remove the active filament ... in this view to see more of what's actually printing. All the other content is so large you can't see the cameras without clicking."

> "At 75% zoom, I can see everything now in the cameras. They're clearly the feature at that size."

> "Keep those like they were: gray/white."
