# Display targets document viewing context and purpose

- **Status:** Accepted
- **Date:** 2026-10-06
- **Type:** Documentation / Display design
- **Supersedes:** None; extends the panel-model-plus-installation model
- **Superseded by:** None

## Decision

Document display targets through panel facts, installation/viewing context, purpose
and switching policy, and presentation requirements. Use Room glance, Nearby glance,
Task station and Desktop workspace as starting viewing profiles with overrides.
Resolution alone never assigns a profile. Separate primary through quaternary purposes
from interruption precedence and priorities within a composition.

[Display targets](../display-targets.md) defines each field's rendering consequence,
the current implementation, the record template and verification expectations. Generic
design vocabulary lives in CastKit; real installation records belong to a deployment's
private inventory. Unknown dimensions and distances remain unknown. These are design
records; this decision does not introduce runtime settings or change existing policies.

## Context

Adaptive scaling handles pixel fit, while equal resolutions can represent very
different physical sizes, distances and attention patterns. Existing capabilities and
content priorities cover part of the problem, but do not encode physical size or
viewing distance. Dedicated displays and sustained browser work also have different
purpose and density requirements.

## Why

Explicit context supplies a readable-fit requirement for existing adaptive layouts.
Separating hardware, installation and purpose lets identical panels serve different
roles without pretending they are different hardware models. Purpose and interruption
orders remain independently understandable and reviewable.

## Evidence

Owner, T3 Code conversation on 2026-10-06, thread identifier unavailable; originating
worktree `t3code-bd9f167f`:

> It's not just resolution or aspect ratio because the physical screen size matters as well.

The owner accepted the proposed profiles, layered record and purpose/interruption
distinction, then requested:

> Great! Document all that
