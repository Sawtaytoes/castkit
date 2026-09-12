# CastKit owns every control, and Home Assistant MQTT is only the automation surface

- **Status:** Accepted
- **Date:** 2026-09-12
- **Type:** Architecture / Product
- **Supersedes:** the "never a new env var, always an HA config entity" reflex in
  [2026-07-03-user-tunable-view-settings-are-ha-config-entities.md](2026-07-03-user-tunable-view-settings-are-ha-config-entities.md)
  — its ban on env vars for user settings stands; its implication that Home
  Assistant is where a setting must live does not
- **Superseded by:** —

## Decision

**CastKit's own admin panel is the complete control surface.** Every setting a
display has is reachable there, and Home Assistant is not required to reach any
of them.

**Home Assistant MQTT exposes the subset worth automating, and nothing else.** It
is a way to automate things around CastKit, not a dependency of CastKit. A knob
earns an MQTT entity by answering "would an automation change this?" — the view,
the pause switch, the backlight, the photo step. A knob that a person sets once
while hanging a panel does not: the margin insets, the photo crop, the dither
algorithm, the registered size and rotation.

The 2026-08-30 record already put the full configuration in the Web UI. This adds
the other half: **a knob is not obliged to appear in Home Assistant at all.**
Adding one no longer means mirroring it through `buildDeviceTopics`,
`buildDiscoveryMessages` and the `configKnobs` map by default. That chain is what
an **automatable** knob costs, and it is now a deliberate choice per knob rather
than the only path.

⛔ **A published CastKit install must work with no broker and no Home Assistant.**
Most people who clone this do not run either. Nothing in the admin panel may
depend on an MQTT round trip to save a value.

The single settings store stands: the Web UI and Home Assistant write the same
values by the same path, and there is no second store.

## Context

The locked 2026-07-03 rule said any user-tunable setting is an HA MQTT discovery
entity — a global default on the server device plus a per-device override — with
the retained state topic as its persistence. That rule was written when CastKit
had no admin UI, so Home Assistant was the only place a person could turn a knob,
and the retained topic was the only persistence available.

CastKit now has an admin panel, and 2026-08-30 made it the full configuration
surface. What survived from 2026-07-03 was the *cost*: every new knob still pays
for a discovery payload, a command topic, a state topic, a knob-map entry and a
seed on boot, whether or not anybody would ever automate it. The Display section
of Home Assistant now carries four margin sliders, four photo-crop sliders, a
dither select and a rotation select that no automation has ever touched.

## Why

- **The admin panel is the setup and maintenance interface.** A person hanging a
  panel should not need a second application to finish the job.
- **Home Assistant's control surface should stay small enough to read.** It is
  the automation surface. Twelve sliders nobody automates make the four entities
  that matter harder to find.
- **The MQTT round trip is a real cost per knob**, in code and in boot-time
  seeding, and it buys nothing for a value set once.
- **Portability.** A self-hoster with no broker is a supported install, not an
  edge case.

## Evidence

> "Home Assistant only needs stuff over MQTT that it makes sense to modify in an
> automation. The other stuff can stay in CastKit where the main admin config
> lives."

> "In fact, CastKit should have _all_ controls because it's the admin panel. HA
> MQTT shouldn't be required for that; that's just a way to automate things
> around CastKit; a semi-dumb renderer app."

— maintainer, this chat (2026-09-12)
