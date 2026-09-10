# The Slatecast `Calendar` view carries weather, like the ePaper `Clock (Agenda)`

- **Status:** Accepted
- **Date:** 2026-09-09
- **Type:** Product behavior
- **Supersedes:** —
- **Superseded by:** —

## Decision

The browser-mode **`Calendar`** view renders **time, date, weather, and today's
agenda**. The weather line sits between the header and the event list.

The line is absent until Home Assistant publishes to
`<base>/<id>/weather/set`, and it stays when the day has no events. It reads the
same `weather` signal the `Ambient` and `Weather` views already read, so no new
topic, no new protocol field, and no new config knob.

`Ambient` is unchanged and stays the clock-plus-weather view with no agenda.

## Context

`Calendar` is the view a browser-mode display parks on when nothing is playing.
Its ePaper counterpart, `Clock (Agenda)`, has carried all four facts since it was
written: its own doc comment says it "builds on `ClockWeatherView`" and renders
"the time, date, and weather" plus an agenda block.

The two renderers had therefore drifted. A house with both kinds of panel idling
side by side showed weather on the ePaper glass and not on the touch panel, for
no reason a reader could name.

The gap surfaced when the HyperPixel Square moved to the basement 3D printers
workbench and was pointed at `Calendar` as its idle view. The owner asked for
"calendar/time/date/weather like other screens" and the view could not supply the
fourth item.

## Why

- **Same job, same facts.** `Calendar` and `Clock (Agenda)` are the same idle
  surface on two renderers. A fact that earns its place on one earns it on the
  other.
- **The data was already there.** Home Assistant publishes weather per device and
  Slatecast already holds it in a signal for two other views. This is a layout
  change, not a plumbing change.
- **An empty day still wants weather.** `Calendar` renders "No upcoming events"
  on a free day. Without the weather line that day is a clock and nothing else.
- **`Ambient` was not the answer.** It shows weather but has no agenda, so
  choosing it trades an appointment for a temperature.

## Evidence

> "I'm fine with music when playing and calendar/time/date/weather like other
> screens."

— maintainer, basement display move chat, 2026-09-09.

`packages/views/src/ClockAgendaView.tsx` doc comment, unchanged since 2026-07-27:
"a clock view that surfaces the day's upcoming calendar events, so an imminent
appointment shows itself on the panel alongside the time, date, and weather."
