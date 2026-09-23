# Printer Status is a CastKit view fed by Home Assistant

- **Status:** Accepted
- **Date:** 2026-09-23
- **Type:** View / data source
- **Supersedes:** —
- **Superseded by:** —

## Decision

Printer Status becomes a native CastKit view. It takes its data from Home
Assistant over MQTT, the same way every other CastKit view does. CastKit opens
no connection to a printer and no connection to a printer dashboard.

The workbench panel's `Printer Status` entry stops being an external view
pointing at a printer dashboard's camera wall and becomes this view. SpoolBuddy
stays external, because that page is a product we do not own.

Pause, Resume and Stop each sit behind an in-page confirmation. CastKit owns the
control and Home Assistant presses the matching button entity, which is the split
already recorded in
[CastKit owns every control](2026-09-12-castkit-owns-every-control-and-home-assistant-mqtt-is-only-the-automation-surface.md).

The view cannot import the shared progress card from the component library. It
reproduces that shape from design tokens instead. Slatecast has no Tailwind and
does not install the React component library, which is a deliberate choice
recorded in its own stylesheet to hold the client's size budget.

## Context

The panel showed a printer dashboard's camera wall, filtered to live printers.
The owner asked for a clean view of the running prints. That page carries per-AMS
humidity, every tray, fan speeds, firmware versions and a camera feed, on a panel
that stands next to the printers it is filming.

The first proposal read the printer dashboard's own WebSocket. The owner asked
for MQTT instead, so the view is not tied to one vendor's server. Home Assistant
was then measured and already holds every field the card needs, per printer:
progress, current and total layers, remaining time, end time, task name, print
status, active tray, error flags, the plate cover image, and Pause, Resume and
Stop buttons.

## Why

- **One data path.** CastKit's whole design is Home Assistant pushing view data
  over one broker. A second path to a vendor's HTTP server would be the only view
  that works differently.
- **The view outlives the vendor.** Any printer Home Assistant supports can fill
  this card. A dashboard-specific client could not.
- **Fewer sessions on the printer.** Home Assistant already holds a session per
  printer. Nothing new connects to the machines.

## Evidence

Owner, T3 Code chat `t3code-737280df`, 2026-09-23:

> A native CastKit view. I'm also wondering if we should do the same with
> Rip-Deck's Kiosk view in the future. For now, make this CastKit 3D printer
> view. We can grab the info off MQTT if possible; then it's not tied to
> Bambuddy specifically.

Home Assistant entity survey, same date: 85 entities for one printer, including
`sensor.<printer>_print_progress`, `sensor.<printer>_total_layer_count`,
`sensor.<printer>_end_time`, `sensor.<printer>_active_tray`,
`image.<printer>_cover_image` and `button.<printer>_pause_printing`.
