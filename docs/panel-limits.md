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
| Cutter Status | A card under 520 px tall that is not landscape, or any card under 400 px tall | The recent-jobs list is not drawn; the current job keeps the space. Two cutters side by side are two tall cards, each laid out for its own shape. | Porthole (480x480 round), Workbench (480x320) | Enforced |
| Printer Status | 480 px on its long edge or less | At most **one** printer in columns. Four or more use compact rows: the rows that fit are drawn and the rest are counted in a `+N more` strip. The strip names them where its chips fit, each with its whole state; a view of 300 px or less, such as a small round panel, or a strip too narrow for a chip's state, shows only the count, and a tap lists every hidden printer. On a round panel they keep to the square inside the circle ([decision](decisions/2026-11-22-printer-status-four-plus-layouts-land-and-name-the-printers-they-hide.md)). | Porthole (480x480 round), Workbench (480x320) | Written down; not enforced |
| Printer Status | Content width below 188 px, such as a 240x240 round panel | Four or more printers draw no rows, because a narrower row cuts its state word short. A wider view whose folded rows still cut a state word in its font draws no rows either. The strip gives the count, such as `5 printers`, and a tap lists every printer with its state, job name and fault. | No panel today | Enforced |
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
