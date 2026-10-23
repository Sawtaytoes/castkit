# Queue chooser

The `queue-picker` view consumes `queue-picker.v1` from any configured source. A named MQTT channel can use QueuePilot's `queuepilot/chooser/<reader>/state` and send actions to `queuepilot/cmd/chooser/<reader>` with the allowlist `touch`, `choose`, `remove`, `reset`, `dismiss`.

The contract carries `sessionId`, `revision`, `isActive`, `expiresAt` (epoch milliseconds), selected `people: [{id,name}]`, and `queues: [{id,title}]`, plus an optional status `message`. A source owns audience matching and playback. CastKit never infers a person's identity or selects the first matching queue.

The view shows removable person chips, complete queue rows with pagination, Reset and Close. Rows are measured against the remaining panel height, including the header, people, status and footer. Interactive controls use the source action path and carry the current session/revision. Expired data is non-actionable even when retained on the broker. Read-only panels cannot issue commands.

An interaction sends `touch` without a polling heartbeat; page navigation also sends it. Automated state refreshes do not extend inactivity. The source should publish a new expiry and the installation should renew its existing temporary display override. Room edge swipes dismiss the source selection and clear only this view's override, letting the ordinary room controller resume. Existing override priority policy remains in the installation.

The default title and instructions fit a 480 by 480 touch display. The same contract renders on other sizes; delivery technology is not a branch in the view. The browser tests run in the four shared windows, and `Views/Queue chooser` supplies invented data for visual regression.
