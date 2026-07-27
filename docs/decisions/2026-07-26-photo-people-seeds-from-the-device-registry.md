# The Photo Frame people filter seeds from the device registry, not from a Home Assistant self-heal automation

- **Status:** Accepted
- **Date:** 2026-07-26
- **Type:** Product behavior
- **Supersedes:** —
- **Superseded by:** —

## Decision

An image device may declare `photoPeople: string[]` in the devices file. On boot
the server seeds the device's retained `photo_people` state from it, using the
**same `!hasValue` gate as every other seeded knob** — so it fills a genuinely
absent value and never overwrites what the broker restored or what the user set
in Home Assistant.

This does not change ownership. Home Assistant still owns the live value; the
registry entry is a **boot-time floor**, exactly like `rotation` and
`ditherProfile.algorithm`, which have seeded this way since the beginning.
Editing the HA text entity never writes back to the devices file.

Corollary: the recovery logic does **not** belong in a Home Assistant
automation. `automation.self_heal_13_3_photo_frame_people` (and the "People:
Blanked" branch of `automation.control_kitchen_counter_eink_screen`) are retired
by this change.

## Context

Retained MQTT is CastKit's only persistence for user settings
([2026-07-03](2026-07-03-user-tunable-view-settings-are-ha-config-entities.md)),
and that is fine until the retained state is destroyed wholesale. The
`inkcast` → `castkit` topic migration
([2026-07-07](2026-07-07-flat-castkit-topics-migration-gated.md)) did exactly
that: it cleared every retained `inkcast/#` topic, including `photo_people`.

On restart the server re-seeded the knobs it knew defaults for. `photoPeople`
was not among them, so the two 13.3" panels came up with an empty filter, hit
the `!peopleText && !queryText` branch in `photoFrameAdapter.ts`, and sat on the
setup placeholder — same 73910-byte image, `last_render` frozen, for days. The
kitchen 7.3" panel survived only because an HA automation happened to carry a
"People: Blanked" trigger that re-asserted its list.

The first fix mirrored that automation for the 13.3" panels. That put the
recovery logic in a place no CastKit reader can see, made it per-device manual
work for every future frame, and left the actual gap — a seed list missing one
entry — unfixed. The failure originated inside the server's own seeding path, so
that is where it is fixed.

## Why

The maintainer, on being shown that the recovery lived in a Home Assistant
automation:

> "Why not move that code into CastKit directly instead of putting it in Home
> Assistant in a separate automation that no one knows about nor can keep track
> of?"

Three concrete wins over the automation:

- **Discoverable.** The default sits next to the device's `mac`/`width`/
  `rotation`, which is where someone debugging a blank frame looks.
- **Covers the real failure.** The visible break needs a server restart (a
  running server keeps the value in memory even if the broker's copy is wiped),
  and a restart is precisely when the seed runs.
- **Generalizes.** Every current and future frame inherits it; no per-device
  automation to remember.

Accepted trade-off: the automation also re-asserted on a *mid-flight* blank
(15s), which the seed does not. That window is thin for the reason above — with
the server up, the frame keeps rendering from memory.

## Evidence

> "Why not move that code into CastKit directly instead of putting it in Home
> Assistant in a separate automation that no one knows about nor can keep track
> of?"
>
> — maintainer, 2026-07-26

Root-cause detail for the original incident is in the home-displays repo:
`docs/2026-07-11-eink-13in-photoframe-blank-people-filter-handoff.md`.
