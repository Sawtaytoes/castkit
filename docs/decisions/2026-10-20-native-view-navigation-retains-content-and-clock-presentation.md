# Native view navigation retains content and clock presentation

Status: Accepted
Date: 2026-10-20
Type: Display interaction and presentation
Supersedes: None
Superseded by: None

## Decision

Keep the display shell and the last complete composition mounted while another
composition loads. First load uses a quiet skeleton. Prevent actions on retained
content until the requested target is ready; discard late responses from previous
targets and remove retained content when access is denied. Animate whole-view changes
on instant displays, respecting reduced motion. Routine data updates do not replay
the transition.

A plain same-origin CastKit view or screen configured as an external view renders
inside the native shell, without loading another document in an iframe. Actual
external apps, unavailable links and links carrying query/hash/zoom behavior retain
the existing external-frame path.

The combined Idle dashboard uses the same Outfit typography, base clock background,
and inline weather icon/temperature/condition as standalone Ambient. Child cards
open the already-loaded daily task details directly, with priority navigation and
Back, without requiring a room-controller round trip.

## Context

The keyed device composition remounted on every target change. In addition, local
CastKit links configured as external views loaded another complete page. The room
controller could briefly expose that fallback while clearing an override. WPE does
not require a document reload for these transitions.

The combined dashboard independently specified Baloo 2, a raised clock background,
and stacked iconless weather. Those differences came from the component, not from
ESP32 support or missing fonts on the device.

## Why

Retaining content removes the loading flash and unnecessary document initialization.
Immediate local child drilldown provides a fast route to information already in memory.
Shared presentation keeps a larger combined dashboard consistent with the clock view.
Keep one subscription for the active target; do not leave hidden views and sockets
running on memory-constrained displays.

## Evidence

Owner, T3 Code chat `0d419ea4-29f8-4ab7-a743-f4613e46cad5`, 2026-10-20:

> Can we add a skeleton or something when loading. What happens right now, I open a new view, and it says "CastKit loading..." or maybe we show the old data and animate in the new data. Something to make it look better.

> Also, we switched from Chromium to this new renderer, but this device is literally a native CastKit display on WPE. is there a reason why it has to reload like that when loading different views?

> The fonts are different too. Strange. Are we using the Baloo 2 font or something and not using it on the ESP32 devices? The weather icon is missing, and the type of weather isn't side-by-side.

> The background isn't darker on the Presto, but the background behind the time is
