# Panel limits

Some panels cannot carry some views. CastKit states each limit here rather than
squeezing a view until it technically fits
([decision](decisions/2026-09-28-a-panel-too-small-for-a-view-is-a-stated-limit.md)).

A limit is written against a panel **property** — size, shape, input — never a
device id. The panels named in each row are the ones that have the property
today.

| View | Panel property | Limit | Panels today | State |
| --- | --- | --- | --- | --- |
| AMS Filaments | Content width below 900 px | One selected printer and AMS unit at a time; use the tabs to browse the rest. The 1280×720 fleet layout supports three printers with three four-slot AMS units each. | Narrow browser panels | Enforced |
| Printer Status | 480 px on its long edge or less | At most **one** printer. More printers may shift to the compact row layout for five or more, once it lands. | Porthole (480x480 round), Workbench (480x320) | Written down; not enforced |
| Printer Status | Portrait | Printers stack top to bottom, not side by side ([decision](decisions/2026-09-28-printer-status-stacks-printers-top-to-bottom-on-a-portrait-panel.md)) | Pi Touch Portrait (720x1280) | Decided; not built |
| Photo Frame | `shape: round` | **Not recommended.** A rectangular photo leaves bands inside the circle. Needs a zoom-to-fill option; the admin panel should recommend against the view here, not refuse it. | Porthole | Written down; not enforced |
| Queue | No touch (`input` without touch) | A long queue scrolls on a touch panel, and the half row at the bottom is the sign that it scrolls. A panel with no touch cannot scroll, so that row is simply cut. | Porthole | Open question |

## Enforcing a limit

Nothing reads this table yet. A view specification already carries machine
limits that the admin panel explains before a view is assigned —
`minimumRepaint` and `valueLifetimeMilliseconds`, checked by
`getDisplayCompatibility` in `packages/server/src/platform/displayCompatibility.ts`.
Size and shape limits belong beside them, as a warning for "not recommended"
and a count cap for Printer Status, so this page and the admin panel say the
same thing.

## Tally Marks History

A plot needs more than 220 pixels of available content height. Shorter panels show the period net, date range, and update time with a stated chart-space limit. The view never starts a graph that would be cut off by the panel. Daily points retain negative values; a selected child adds the dated goal. Cumulative points begin at the selected period, and task minutes remain separate by task.
