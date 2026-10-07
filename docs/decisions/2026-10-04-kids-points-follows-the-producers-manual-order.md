# Kids Points follows the producer’s manual order

- **Status:** Accepted
- **Date:** 2026-10-04
- **Type:** Behavior
- **Supersedes:** None
- **Superseded by:** None

## Decision

Kids Points uses the producer’s optional zero-based `displayOrder` to sort children. Names break ties and provide a stable fallback for older producers without positions. Filtering children retains the same relative order. Scan updates preserve the known position.

## Context

The display sorted child names alphabetically, independently of the points app.

## Why

One parent-controlled order keeps the applications consistent without collecting age information.

## Evidence

User, 2026-10-04: "For now, have ordering be manual." The request applies to both the points app and CastKit.

Chat: b37dd6d6-cb03-45c3-813b-87820ed6262a.
