# Room timers use deadline priority

Status: Accepted
Date: 2026-11-01

Room timers automatically appear on configured instant and fast displays. The source app remains the only scheduler. A timer carries its room and topic alongside its revision-guarded entity ID. Pause, Resume, and Cancel use the existing source command transport.

Rank running timers by absolute deadline, then paused timers. Use the shared priority layout selector to keep as many complete timer cards as fit, allocate extra space to the soonest deadline, and discard later timers first when necessary. Promote the next timer when an earlier timer leaves. Manual and urgent overrides retain precedence. Return to the existing display selection when the room has no active timers.

Instant panels show seconds. Fast panels show an approximate countdown in ten-second steps, matching the ten-repaint freshness budget. Slower effective grades do not automatically select this view. Battery power continues to reduce the effective grade.

Evidence: owner request, November 1, 2026, including multiple timers, Pause/Cancel, retained topic, and smallest-panel priority.
