# A battery indicator appears on the glass only when the battery is low

- **Status:** Accepted
- **Date:** 2026-09-14
- **Type:** Product behavior
- **Supersedes:** — it settles the on-glass question that [2026-09-13-a-battery-is-a-panel-fact-a-power-source-is-an-installation-and-charge-is-telemetry.md](2026-09-13-a-battery-is-a-panel-fact-a-power-source-is-an-installation-and-charge-is-telemetry.md) deliberately left open
- **Superseded by:** —

## Decision

**Nothing about the battery appears on the glass until the charge crosses the
low threshold.** Home Assistant carries the exact number all the time; the panel
does not.

Three states, not two:

| State | What the glass shows |
| --- | --- |
| Above the low threshold | Nothing. The view has the whole panel, exactly as it does on a mains display. |
| Below the low threshold | The view, plus a battery mark. The mark is an **overlay**, not something the view lays out. |
| Empty | The view stops repainting. One final frame says the battery is empty ([the end-state rule](2026-09-13-a-battery-is-a-panel-fact-a-power-source-is-an-installation-and-charge-is-telemetry.md)). |

**The mark is drawn by the renderer, after the view, and no view reserves room
for it.** That is the load-bearing part. Sixteen view components across two
renderers must not each grow a battery slot for a case that is false almost
always — on the image half it is composited after the view renders, and on the
live half it is a fixed-position element on the stage, outside the active view.

**The threshold applies to any panel with a cell, wired or not.** A plugged-in
M5Paper never shows the mark, because its cell never gets low. If mains fails
and the cell drains, it shows — which is exactly when somebody needs to know.

**It is a shape, never a color.** Half the panels that can have a battery are
one-bit mono, so a red mark and a black mark are the same mark.

**The threshold is a setting in the admin panel**, not an environment variable
and not a constant. ⚠️ It is expressed as a percentage, and the percentage
depends on a voltage curve that is not yet calibrated on any unit.

## Context

The owner was asked when the indicator should appear, and chose "only when it is
low" over always-on-battery, always-if-it-has-a-cell, and never.

The alternatives each failed on something concrete. An always-on glyph costs
room in every layout, and on the 250x122 Inky pHAT that room is real — it is
four characters of a line that already truncates. Showing it whenever a cell
exists puts a permanent 100 % mark on a panel that has been plugged in for
months. Never showing it leaves the one genuinely urgent case invisible on the
device itself.

## Why

A battery reading is not actionable until it is low. Above the threshold the
number answers a question nobody is asking while standing in front of the panel,
and Home Assistant answers it better anyway, with history.

Making the mark an overlay rather than a view element is what keeps this from
spreading. A battery slot in every view would be sixteen layouts changed, sixteen
stories to review, and sixteen chances for one of them to reserve the room and
never release it. An overlay is one place, and a view that does not know about
the battery cannot get it wrong.

The rule is stated against the **threshold** rather than against `power:
battery` so that a wired panel with a cell is covered without a second rule. The
question "is this worth interrupting the view for" has one answer, and the
install type does not change it.

## Evidence

Asked and answered in this chat, 2026-09-14. The owner picked "Only when it is
low" from four offered options, described as: nothing on the glass until the
charge crosses the low threshold, then a clear notice, with Home Assistant still
carrying the exact number all the time.

The pHAT space argument is measurable: the panel is 250x122, and the existing
compact layouts already cap summaries to the row's remaining width because text
runs off the edge.

The mono argument is the fleet: of the two panel models that could carry a cell
in this house, the one that does — the M5Paper — is `color: monochrome`.

Chat: T3 Code thread `a7e03562-acab-4308-ba0d-fc93531ece7f`.
