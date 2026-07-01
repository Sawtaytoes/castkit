# Inkcast is a public open-source app on GitHub, not the private Gitea

- **Status:** Accepted
- **Date:** 2026-07-01
- **Type:** direction
- **Supersedes:** —
- **Superseded by:** —

## Decision

Inkcast is published as a **public, open-source repository on Kevin's GitHub**,
not on the self-hosted Gitea (`gitea.octen.dev`) that hosts the private homelab
repos. The repo is set up for third-party self-hosting: permissive license,
clean README, no homelab secrets committed, no hard-coded private hostnames in
the app code (device/broker config comes from the environment).

## Context

The `agentic` workspace and its sibling homelab repos are private (they encode
Kevin's network, credentials, and household specifics). Inkcast is different in
kind: it is a general-purpose e-ink render/push **application** that other people
could run against their own panels.

## Why

- "This inkcast work, I think we can put it on my GitHub rather than Gitea."
- "Mainly because others could use it too. The Agentic stuff is private, but
  these are apps."

Building for an external audience from day one keeps homelab-specific assumptions
out of the code (they belong in config/env), which also makes the app cleaner for
Kevin's own multi-device use.

## Evidence

Direct user quotes, this chat, 2026-07-01 (see above).

## Consequences

- The GitHub remote is **not** created and nothing is pushed until Kevin confirms
  the Phase-0 spine is ready to publish (publishing is outward-facing).
- Ship a permissive `LICENSE` (MIT unless Kevin prefers otherwise) and keep the
  README self-host-friendly.
- Secrets (MQTT broker creds, device tokens) are read from the environment, never
  committed.
