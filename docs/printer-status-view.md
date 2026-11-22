# Printer Status view

A native CastKit view for a workbench panel: the prints that are running right
now, plus a print that has just finished or failed and is still holding its
plate. An idle printer gets no card. When every printer is idle the view says
`Nothing printing`, and the panel's automation normally moves it to another
view before anyone reads that.

It replaces an external view that pointed at a printer dashboard's own camera
wall. That page is a control surface for a person at a desk. It carries per-AMS
humidity, every tray, fan speeds, firmware versions and a camera, on a panel
standing next to the machines it is filming.

## Where the data comes from

Home Assistant, over MQTT, like every other CastKit view
([architecture](architecture.md)). CastKit opens no connection to a printer and
no connection to a printer dashboard. Home Assistant already holds one device
per printer, so the view is tied to Home Assistant and not to any one vendor's
server.

Per printer, the payload carries:

| Card field | Home Assistant entity |
| --- | --- |
| Name and number | the device's own name, ordered by the installation |
| Model and nozzle | `sensor.<printer>_nozzle_size`, `sensor.<printer>_nozzle_type` |
| Job name | `sensor.<printer>_task_name` |
| State | `sensor.<printer>_print_status`, `sensor.<printer>_current_stage` |
| Percentage | `sensor.<printer>_print_progress` |
| Layer | `sensor.<printer>_current_layer`, `sensor.<printer>_total_layer_count` |
| Remaining | `sensor.<printer>_remaining_time` |
| Finishes | `sensor.<printer>_end_time` |
| Active filament | `sensor.<printer>_active_tray` |
| Filaments used by the print | `sensor.<printer>_print_weight` attributes and the matching AMS tray sensors |
| Plate picture | `image.<printer>_cover_image` |
| Problem banner | `binary_sensor.<printer>_hms_errors`, `binary_sensor.<printer>_print_error`, `binary_sensor.<printer>_online` |

A printer is **active**, and therefore on the glass, while its print status is
`prepare`, `running` or `pause` — and it **stays active after the print ends**,
as `finished` or `failed`, until its plate is cleared. Home Assistant keeps
publishing the job through that window and drops it from the payload once
BambuBuddy reports the plate clear, whether the clear came from this panel or
from anything else that clears a plate in BambuBuddy.

### The topic and the payload

Home Assistant publishes every active printer, together, retained, to
`castkit/<device-id>/printers/set`:

```json
{
  "printers": [
    {
      "id": "printer-1",
      "name": "Printer 1",
      "jobName": "Sample print",
      "percent": 41,
      "state": "printing",
      "currentLayer": 32,
      "totalLayers": 334,
      "remainingMinutes": 128,
      "finishAt": "2026-09-23T21:05:00-05:00",
      "thumbnailPath": "/api/image_proxy/image.printer_1_cover_image?token=...",
      "filamentText": "PLA Matte · AMS 1 slot 1",
      "filamentColor": "1C1C1CFF",
      "filaments": [
        {
          "name": "PLA Matte",
          "color": "#1c1c1c",
          "location": "AMS 1, slot 1"
        },
        {
          "name": "Support for PLA",
          "color": "#f1e7d0",
          "location": "AMS 2, slot 3"
        }
      ],
      "nozzleText": "0.4 mm hardened steel"
    }
  ]
}
```

`id`, `name` and `state` are required; a row missing any of the three is
dropped, because `id` is what a Pause is addressed to. `state` is `preparing`,
`printing`, `paused`, `finished` or `failed` — the five CastKit draws.
Everything else degrades: a job with no layer count still shows its percentage.
`percent` may be fractional; the card writes the value it receives as a whole
number rounded down, so `99.99` reads `99%`. Rounding down never turns a value
under 100 into `100%`. A `finished` job always reads `100%`, and a source may
itself round a value up to 100 before the card receives it.
On a `finished` or `failed` job, `finishAt` is the time the print **ended**, and
the card prints it as `Ended 3:47 PM` when it is present.

⚠️ **`{ "printers": [] }` is a real answer and the one that clears the glass.**
Publishing nothing leaves the last job on the panel forever.

The **Filament** row is always drawn. A print always runs from a tray, but
Home Assistant reports `active_tray` only once the print starts, so a preparing
job has none. Dropping the row made that card shorter than its neighbors; it
shows a dashed empty swatch and `Chosen when the print starts` instead. The
2×2 grid's and a compact row's tiles are too narrow for that sentence in some
fonts, so they say `Not yet`, and a row's tile is always wide enough for it.

When the source provides `filaments`, the row opens a list of the filament names,
colors and AMS slots used by the print. The HA publisher reads the positive
per-slot values from `print_weight`; it does not list every filament loaded in
the AMS. A source that has no per-slot print mapping can still publish the
active filament, and the dialog notes that slot details are unavailable. A
tile can cut `filamentText` short, so the dialog gives it whole at the top
unless a slot in its list already says all of it: the slot's name, alone or
followed by its tray, with spacing (around a `·` too), case and commas
ignored. A list can lack
the active material's name or leave it out entirely, and a summary can say
more than the slot, so anything else keeps the summary. The summary carries
the feed's active color as a swatch. When exactly one slot says it, that
slot takes the active color if it has none of its own; when two slots could
say it, such as a name with no tray, the summary keeps its own line and
color, and neither slot is named active.

Two conveniences for an HA template. `finishAt` takes epoch milliseconds or an
ISO timestamp, and is optional — CastKit computes the finish from
`remainingMinutes` when it is absent. Every text field treats `""`, `unknown`,
`unavailable` and `None` as absent, so a template does not have to guard each
one.

⚠️ **No flow-rate field is available.** A printer reports the nozzle's diameter
and its material, and nothing about high flow. Measured on three X1C units,
2026-09-23: `nozzle_type` is `hardened_steel`, `nozzle_diameter` is `0.4`, and
the flow-type field is empty on all three. The card therefore says
`0.4 mm hardened steel` and claims nothing more.

## Controls

Pause, Resume and Stop, each behind an in-page confirmation. CastKit owns the
control and Home Assistant presses the matching button entity, which is the
existing split ([CastKit owns every control](decisions/2026-09-12-castkit-owns-every-control-and-home-assistant-mqtt-is-only-the-automation-surface.md)).

The confirmation is in the page, never a browser dialog. A remote-display
receiver can return a touch to a named page target and cannot answer Chromium's
own confirmation box. It covers the panel rather than the card: at three columns
a card has no room for a legible question, and stopping a print is not a
decision to make against 13 px of type. A question nobody answers withdraws
itself after twelve seconds — the next person to walk up to a wall panel did not
ask it.

Each confirmed control publishes one command on `castkit/<device-id>/command`,
with the printer's own id as the value:

```json
{ "action": "printer_stop", "value": "magi" }
```

The actions are `printer_pause`, `printer_resume`, `printer_stop` and
`printer_clear_plate`. Home Assistant maps the id onto that printer's button
entity. CastKit does NOT predict the result the way the media controls do: a
pause takes seconds to take effect on the machine in the room, so the button
shows its own pending label and the card waits for the printer's own state.
In a compact row the pending button shows its spinner alone and keeps
`Resuming…` or `Stopping…` for assistive tech, because those words do not fit
half of Pause and Stop's 196 px in every font.

Pause, Resume and Stop sit at the **foot of an active card**, full width and
split evenly, sized for a fingertip: 64 px tall on the 1280x720 workbench panel,
scaled in proportion on the smaller profiles and never under 48 px. The box IS
the touch area — no pseudo-element pad — because the remote-display renderer
binds a touch by the bounding box
(`printerStatusTouchTargets.test.tsx` measures them).

### Clear plate

A `finished` or `failed` card offers one control: a full-width **`Clear plate`**
button, with nothing under it. It is **one tap, with no confirmation** — a
print that has already stopped cannot be lost by it. No sentence points at any
other way to clear the plate: whoever can read the button will tap the button,
and the other ways are one household's hardware, not every panel's
([decision](decisions/2026-09-28-the-clear-plate-card-names-no-other-hardware.md)).

The tap publishes `{ "action": "printer_clear_plate", "value": "magi" }`, the
button reads `Clearing…`, and the card waits for the job to leave the payload.
Home Assistant maps `printer_clear_plate` onto BambuBuddy's clear-plate call
for that printer. If the job is
still in the payload after ten seconds, the label lapses and the button is live
again, so a request Home Assistant dropped costs one more tap and not a dead
control on the wall.

After the clear, the panel shows **whatever Home Assistant makes active next**.
CastKit does not switch the view on its own: HA is always in charge of the
active screen, and this view only renders the printers it is handed
([decision](decisions/2026-09-28-a-finished-print-stays-on-the-glass-until-the-plate-is-cleared.md)).

## Leaving the view

The panel's view drawer is off. An undrawn region at either edge hands the panel
back to the automation — a 48 px inward pull or a tap, answered by one short
confirmation ([decision](decisions/2026-09-23-an-edge-hands-the-panel-back-and-draws-nothing.md)).

The region exists only while something has taken the panel over. Home Assistant
says so through the `View hold` switch, which publishes `on` or `off` to
`castkit/<device-id>/view_hold/set`. The automation that starts a hold turns it
on; the one that lets the hold lapse turns it off. It is runtime state, never
retained and never persisted, so a restart leaves no live edge with nothing to
undo.

The edge publishes `{ "action": "view_release" }`. It is a separate action from
`view` on purpose: `view` starts a hold, and this ends one.

## Layout

One column per active printer, because the item is card-shaped: it carries a
picture the eye can anchor on. The count changes the shape rather than only the
column width.

| Active printers | Shape |
| --- | --- |
| 1 | The picture on the left, the facts in a column on the right. Type grows to fill the panel, because there is room and the panel is read a step back from the bench. |
| 2 | Two columns. The picture sits above the facts and takes the slack height. |
| 3 | Three columns, same shape as two. |
| 4 | A 2×2 grid when the panel can hold two cards of facts; otherwise rows, as for five. On a wide panel each card puts the picture beside the facts. |
| 5 or more | One compact row per printer, and only the rows that finish on the glass. See below. |

The plate picture has no box around it. The cover is square and carries its own
dark background, so a surrounding panel letterboxes the square inside a
differently colored rectangle, and that reads as a cropped picture.

The progress band is the shared progress-card shape, with one departure: **the
percentage sits at its right and the TIME LEFT at its left.**

The time left is the fact a person walking up to a running printer wants, and it
is the one the metric row used to carry in the smallest type on the card. It is
not repeated — **`Remaining` is gone from the metric row**, which is why that row
is two blocks wide and not three.

⚠️ **`Finishes` names its day whenever the finish is not today** — `3:47 PM`
later today, `Tomorrow 3:47 PM`, `Sun 3:47 PM`, and a date such as `Aug 1
3:47 PM` a week or more out. A bare clock time reads as today, and on a printer
that runs for more than a day it was read as three hours away when the printer
meant twenty-seven. The test is the **calendar day**, not a twenty-four hour
window: a print that ends at 01:00 is eight hours away and is still not today.
The words are BambuBuddy's, which is where the same finish is read everywhere
else ([decision](decisions/2026-09-25-a-finish-time-names-its-day-when-it-is-not-today.md)).

A paused printer renders **nothing** at the band's left. There is no honest
estimate, the chip above already says why, and an em dash would be a placeholder
holding open a space for a number that does not exist.

⚠️ The band's row is `justify-content: flex-end` with an auto margin on the time,
never `space-between`. With `space-between` a paused card has a single child, and
the percentage is shoved to the left edge and into the colored fill.

The state word — `Printing`, `Paused`, `Preparing`, `Finished`, `Failed` — is a
**chip in the card's head, at the right of the printer's name**, with a dot
before it. It is a fact about the printer, not about the progress, so it belongs
with the name. The buttons that change it used to share the head; they sit at
the foot now, for their size, and the head no longer wraps.

The chip takes its color from the card's intent rather than naming a state, so a
new state needs no new chip rule. The neutral case is the accent rather than a
gray: printing is the normal case and should read as calm, and a paused, faulted
or finished card is already tinted around it.

### Finished and failed cards

A `finished` or `failed` print keeps its card until the plate is cleared, and
the **whole card** takes the state's color: the success surface and border on a
finished print, the danger surface and border on a failed one — the same tint a
card reporting a problem already gets. The chip and the band fill follow.

The band reads `100%` on a finished print, and the percentage reached on a
failed one. Where the time left was, two short lines say how it ended:
`Finished` or `Stopped at layer 173`, over `Ended 3:47 PM` when the payload
carries `finishAt`. The ended time names its day the way `Finishes` does, in
the other direction: a plate nobody cleared overnight reads `Ended Yesterday
3:47 PM`, not as this afternoon.

The metric row goes, and the Pause and Stop pair goes; `Clear plate` takes
their place. A finished card beside a running one is
therefore a different height, and that is intended: the reminder is the shape.

### The job name is a control

A printer reports a slicer file name, not a title. The view replaces underscores
with spaces and joins the parts the operator separated with a middle dot, drops a
part that is only the printer's own name, and prints the rest. It does not guess
any other part away.

The result is one line with an ellipsis. Tap it to open the whole name; tap again
to close it. Hover or keyboard focus shows the file name the printer reported.

### Four or more printers

Approved by the owner on 2026-09-28 and built on 2026-11-22
([layouts](decisions/2026-09-28-printer-status-adds-layouts-from-four.md),
[what landed](decisions/2026-11-22-printer-status-four-plus-layouts-land-and-name-the-printers-they-hide.md)).

1. **Four is a quad: two rows, two columns.** On a wide panel each card puts
   the picture on the left at 38% and the facts on the right. On a narrower
   panel the card keeps the column shape, the picture above the facts. Filament
   keeps its full-width box, because at a third of the facts' width its
   `2 filaments · Details ›` ran out of the box. Its name and its tray take a
   line each; a longer name ends in an ellipsis rather than wrapping over the
   label, and the filament list gives it whole.
2. **Five or more are compact rows.** A row reads left to right: the picture,
   the name with its state chip over the job name, the Layer, Finishes and
   Filament blocks, the band, and then Pause and Stop (or Clear plate). Each part
   has its own column, so nothing sits on another. A row is at least 64 px, and
   rows share the height left over, so five rows are 132 px each and nine are 71
   px each on the 1280×720 panel. The picture is as tall as its row, and the
   name, band and buttons grow with it within fixed floors and caps.
3. **Only the rows that finish are drawn.** The view measures its card area and
   divides it by the row (`printerRowFit.ts`). When a printer does not fit, a
   36 px strip under the last row says `+1 more printer` and names each hidden
   printer with its number and its percentage or state, tinted like its card.
   The 1280×720 panel draws nine rows above the strip, so the tenth printer is
   the first one the strip names. The chips that fit are a glance, each
   whole or absent. In a chip the name gives way first, down to three
   letters, so a hidden `Failed` still reads in words; a tap on the strip lists every hidden printer with its
   state, job name and fault. A view of 300 px or less draws only the count,
   because no chip fits beside it. So does a strip whose first line would
   cut a chip's state, as a wide fallback font can on a small panel: a
   chip that says `Prepa…` names no state. The view checks after every
   render, chips drawn, so a wider strip or a narrower font brings them back.
   The printers keep the order Home Assistant sends.
4. **A tap on a job name opens the details.** The 2×2 grid and the rows have
   no room to open a name in place, so the tap lists that printer's whole job
   name, its exact file name, its whole fault, its nozzle, its layer, the
   time left and the finish time (or, once it has stopped, when it ended),
   and its filament, one line per slot with its swatch, brand and finish,
   in a dialog. The time left is the feed's own, which can differ from the
   finish time. The exact file name shows only under a readable name, so
   a job named only for its printer reads once. A failed
   printer's line gives its percentage and the layer it stopped at. A row can drop its
   Layer, Finishes and Filament tiles (see below), and the dialog keeps them
   a tap away. The hidden-printer list gives each hidden printer the same
   facts. Each of the
   view's dialogs holds the keyboard while it is open: focus starts inside,
   Tab stays inside, and Escape closes only that dialog. In a row, a fault takes the job name's
   line, inside the same button. In the 2×2 grid, a fault gets two whole
   lines, never a third cut through its padding, and the Layer and
   Finishes blocks give it their room. A grid card's `Ended` time wraps or
   gives way whole, as in a row, rather than end in an ellipsis.
5. **The count picks the arrangement; the panel only folds it.** Four printers
   use rows instead of the quad when the view is under 652 px wide, or when the
   card area is too short for two cards. A quad card puts its picture beside
   the facts from a 1184 px view, and then needs a 624 px card area; a narrower
   grid stacks the picture above the facts and needs 836 px, so the picture is
   never squeezed away. Every cutoff measures the view's **content box**:
   its width less its own padding, the box its container queries see. On a
   square panel the padding is 52 px, so the view widths in brackets below
   are the same cutoffs; a round panel pads its view to the square inside
   the circle, so its view folds at a wider outer width. The quad needs
   600 px of content (652 px view), and puts its picture beside the facts
   from 1132 px (1184 px view). A turned panel folds for the width it has.
   A row with 1048 px of content or less (1100 px view) drops the three fact
   blocks. A wider view drops them too while a drawn row would cut its
   state word, as the widest facts can in a wide fallback font: no fixed
   width holds them in every font, so the view measures the rows it draws.
   A wider view, another height, a font that finishes loading, or the next
   payload tries the blocks again. At 760 px or less (812 px view) it drops the number badge, so a
   long state word such as `Preparing` stays whole beside a name at its
   4.5 em floor. At 708 px or less (760 px view) it also drops the
   nozzle and the time left, and Pause and Stop become Lucide icons whose
   words stay in the accessibility tree. The facts are already folded
   there, so a state word that a wide font would cut moves onto its own
   line under the name instead. The band is 72 px wide, and its percentage
   shrinks from 20 px only where a wide font needs it to keep `100%`
   inside. A settled row drops its `Finished`
   or `Stopped at layer N` lines there too: the chip still names the state,
   the band keeps the percentage, and the job name's dialog still gives the
   stopped layer. Wider than that, the stopped layer's line wraps rather
   than lose its number. The `Ended` time gives way to it in a band 180 px
   wide or less, and in any band too short to hold it under the stopped
   line. It gives way whole, never cut: the summary wraps it into a column
   the band hides. In a band 180 px wide or less, a settled card's
   percentage also shrinks with the band, to 22.5 px in the narrowest
   150 px band, so the stopped line keeps room even in a wider fallback
   font. At
   388 px of content or less (440 px view) the picture goes, and the name,
   the state and the job take a line each, so none of them is squeezed
   away. At 300 px or less, such as a small round panel, the band moves
   under the job as a slim fourth line and each row grows to 84 px. The state chip and the percentage always stay.
   A row needs 188 px of content (`PRINTER_ROW_MIN_WIDTH`), because a
   narrower row cuts `Preparing` short. A view narrower than that, such as a
   240 px round panel, draws no rows: the strip says `5 printers`, without
   `+` or `more`, and a tap lists them all. This is a stated limit in
   [panel limits](panel-limits.md). A wider row that still cuts its state
   word with its facts folded, as a wide fallback font can, does the same:
   nothing is left to give way. The view measures the words to the fraction
   of a pixel after every render, and a wider view, another height or font,
   or a new payload tries the rows again. On a
   round panel, four printers and up keep to the square inside the circle,
   and so do the dialogs. Layer and Finishes keep their whole width; the
   filament name gives way first, and the Filament tile never gets narrower
   than its own label, or its `2 filaments` count. The facts column never
   gets narrower than Layer, Finishes and that tile; the name's column
   gives way to it. The count sits on the label's line and shows only when
   the line holds both: a line too short for both moves the count, whole,
   out of view.
6. **Pause and Stop stay a fingertip tall.** Every row button is at least 48 px.

## Previews

The design was chosen from candidates served at the panel's true size against
live printer data. Those captures are **not** in this repository and must not be:
a plate picture is a picture of whatever the household is printing, and one of
them carried a person's name in the model itself. A PNG is opaque to every
search, so nobody finds that later.

The canonical preview is this view's Storybook story, rendered from fixture
data at the panel profile, like every other view here. `Views/Printer Status`
carries one story per panel plus the states that change the layout: one, two and
three printers, a paused card, a card reporting a problem, a preparing card, and
the idle panel. Four through ten printers, and twelve, are on the 1280×720
workbench panel only. The settled states are on **every** panel, because they change
the card's shape: a finished card, a failed card, the two beside a running
printer, and the finished card mid-clear reading `Clearing…`. They are the
`vrt` job's pictures of this change.
