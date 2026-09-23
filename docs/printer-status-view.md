# Printer Status view

A native CastKit view for a workbench panel: the prints that are running right
now, and nothing else. An idle printer gets no card. When every printer is idle
the view says `No prints running`, and the panel's automation normally moves it
to another view before anyone reads that.

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
| Filament | `sensor.<printer>_active_tray` |
| Plate picture | `image.<printer>_cover_image` |
| Problem banner | `binary_sensor.<printer>_hms_errors`, `binary_sensor.<printer>_print_error`, `binary_sensor.<printer>_online` |

A printer is **active**, and therefore on the glass, while its print status is
`prepare`, `running` or `pause`.

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
own confirmation box.

## Layout

One column per active printer, because the item is card-shaped: it carries a
picture the eye can anchor on. The count changes the shape rather than only the
column width.

| Active printers | Shape |
| --- | --- |
| 1 | The picture on the left, the facts in a column on the right. Type grows to fill the panel, because there is room and the panel is read a step back from the bench. |
| 2 | Two columns. The picture sits above the facts and takes the slack height. |
| 3 | Three columns, same shape as two. |
| 4 or more | **Not designed.** See below. |

The plate picture has no box around it. The cover is square and carries its own
dark background, so a surrounding panel letterboxes the square inside a
differently colored rectangle, and that reads as a cropped picture.

The progress band is the shared progress-card shape: the percentage is centered
in a filled band and the state word sits on its baseline.

### The job name is a control

A printer reports a slicer file name, not a title. The view replaces underscores
with spaces and joins the parts the operator separated with a middle dot, drops a
part that is only the printer's own name, and prints the rest. It does not guess
any other part away.

The result is one line with an ellipsis. Tap it to open the whole name; tap again
to close it. Hover or keyboard focus shows the file name the printer reported.

### Four or more printers

The three-printer arrangement does not extend. A fourth column leaves each card
too narrow for the band, the four metric blocks and the picture at a readable
size on a 1280 px panel.

Notes for whoever takes this on:

1. **Four is a quad: two rows, two columns.** Each cell is about half the panel
   in each direction, which is close to the two-column cell in width and half its
   height. The picture must shrink first, and the metric blocks fold from three
   across to two.
2. **Five or more needs a different view, not a smaller card.** Past four cells
   the plate picture stops earning its space. The likely answer is a row list
   with no picture: the number chip, the job name, the band, and a finish time,
   which is what the optical-tower kiosk already does at nine rows.
3. **The switch is a count, not a panel width.** A panel does not change size,
   and the same view must answer for one printer and for nine. Read the count and
   pick the arrangement; do not reach for a media query.
4. **Keep the state readable at the smallest size.** The percentage and the
   state word are the two things a person reads from across the room. Whatever
   folds away, those two stay.
5. **A count above three is untested here.** The installation this was built for
   has three printers. Build the arrangement behind fixture data first, and shoot
   it at the panel's true size before it reaches glass.

## Previews

The design was chosen from candidates served at the panel's true size against
live printer data. Those captures are **not** in this repository and must not be:
a plate picture is a picture of whatever the household is printing, and one of
them carried a person's name in the model itself. A PNG is opaque to every
search, so nobody finds that later.

The canonical preview is this view's Storybook story, rendered from fixture
data at the panel profile, like every other view here.
