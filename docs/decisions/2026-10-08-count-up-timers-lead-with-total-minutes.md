# Count-up timers lead with total minutes

Status: Accepted
Date: 2026-10-08
Type: Owner preference and defect correction
Supersedes: None
Superseded by: None

## Decision

A running count-up card shows its task and accumulated daily minutes as the primary time value. This scan's elapsed minutes are secondary. Total minutes equal the producer's banked minutes plus whole minutes elapsed from the saved session start. A missing banked baseline shows only session minutes rather than inventing a daily total.

Count-up sessions remain active until stopped, including after reaching their points tier. Restore room-local sessions from the producer's saved reader after reconnects. Preserve simultaneous timers and countdowns' existing time-left behavior. Slow displays show the banked baseline and absolute start instead of a running duration.

## Context

The producer already publishes banked minutes, but CastKit discarded them and only treated countdowns as persistent timer activity. Count-up starts showed generic start feedback.

## Why

Accumulated minutes tell a child how much of the task they have done today. The current session remains useful supporting information. Reader identity and saved starts allow a display to restore a session without replaying a scan or changing scoring.

## Evidence

Owner, current T3 Code conversation, 2026-10-08 (chat UUID unavailable):

> 0 minutes this session, but 27 minutes total. The total minutes I think is more important than "this session" when talking priorities.

Tests cover source normalization, zero minutes, room filtering, restored sessions, matching stops, continued count-up beyond a goal, independent total/session advancement and active-only visibility. Visual fixtures cover dark/light all-child square boards and compact timer layouts.
