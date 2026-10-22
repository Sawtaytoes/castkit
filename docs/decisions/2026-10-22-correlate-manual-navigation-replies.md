# Correlate manual navigation replies

Status: Accepted
Date: 2026-10-22
Type: Implementation
Supersedes: None
Superseded by: None

## Decision

Browser view commands carry an optional navigation ID through the controller and temporary display override. A browser ignores replies for its earlier local requests while a newer request is outstanding, and after the newer selection completes. If the new request times out, the latest deferred target reconciles the display. Unknown controller requests and uncorrelated automation targets remain authoritative. Metadata does not change override priorities, durations or cache identity. Older clients and controllers remain supported.

## Context

Prepared views remove repeated data and mount delays, but rapid gestures can still receive queued controller replies in the wrong order relative to the latest input.

## Why

Request identity establishes which local gesture a reply acknowledges without guessing from view names or changing automation policy.

## Evidence

> "I drag one side, then another, then the other side again, then it shows the original first swipe screen, then the next, then that one again."

Owner conversation `8ef10dee-632c-46d3-af23-6b22ddbeb244`. A native-input rapid-swipe probe reproduced older Music and Points selections after newer gestures.
