# Idle dashboard

The browser-only Idle dashboard view combines a large clock and weather at the
left, up to three upcoming agenda entries at the right, and household points
across the bottom. At 1024 by 600 the clock digits are 210 pixels tall. Narrow
compositions stack the sections. An ended appointment remains for one hour;
all-day entries remain visible. No calendar or points channel is required for
the clock to work. Missing optional feeds omit their sections.

Create a view with one `idle-dashboard` panel. Bind `data` to an `agenda.v1`
channel, `weather` to `weather.v1`, and `points` to `kids-points.v1`. All bindings
are available in the view editor. The panel's Time zone and 12-hour clock
settings control its date/time formatting. Child cards preserve producer order,
identity colors, current daily totals, goals and latest task labels. This view
is read-only and never awards points or fabricates activity.

For a landscape music page, the existing Music Player view's Side by side
layout places artwork and controls beside the queue. Bind its `music-player.v1`
channel to the desired Music Assistant player. This remains independent of
other displays and does not reconfigure their speakers.
