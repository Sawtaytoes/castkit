# Points history

Add a **Tally Marks History** source in Management → Sources, then a `points-history.v1` channel with the number of rolling calendar days (1–366) and optional child IDs. Bind it to a **Tally Marks History** view. The view selects daily points, cumulative points, net points by task, or task minutes. Select one child to add the dated daily goal, and optionally select a task key for time.

The points service owns every calculation. CastKit requests its summaries over MQTT and uses the same Charcuterie chart geometry as the app. CastKit has no InfluxDB credentials and cannot award, reverse, or spend points through this source.

Default request and response topics are `tally-marks/cmd/reports/points` and `tally-marks/resp/reports/points`. Requests carry an opaque ID, a start day, and an end day. Responses are non-retained and correlated to that ID. The versioned contract strips parent-only event snapshots, overlap review entries, and reasons before publication. Sources and channel settings expose topic overrides for another installation.

The source requests history after startup and after ledger, relevant child-state, or goal changes. It debounces bursts and serializes channel requests. A repeated timer state with unchanged day, points, and goal does not re-query history. An unanswered or invalid response marks the source as unavailable; it does not substitute zero values. Disposal clears pending response and debounce timers and releases subscriptions. No recurring poll is added.

Daily and cumulative series preserve negative values. Cumulative points begin at the selected period. Minutes come from completed session deltas and remain separate by task. The view labels a partial current day, source fallback, and absolute update time. Below 220 pixels of available content height, it presents a compact period summary with a stated chart-space limit. Browser deliveries and server-rendered images share this view.
