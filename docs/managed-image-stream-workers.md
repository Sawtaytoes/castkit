# Managed image-stream workers

The main CastKit image includes the native image-stream client. One app can host
its server and the independent stream workers for registered devices. Standalone
worker images remain available for installations that need another host; they are
not required for the managed installation.

Set the deployment infrastructure variable `CASTKIT_STREAM_WORKERS_FILE` to a
mounted, private JSON file:

```json
[
  { "deviceId": "display-01", "configPath": "connections/display-01.yaml" },
  { "deviceId": "display-02", "configPath": "connections/display-02.yaml" }
]
```

Relative paths resolve beside this file. Each device must already be registered,
and neither device IDs nor connection files may be duplicated. Mount the YAML
connection files and their credential files read-only, keeping their existing
`secrets_path` values valid inside the main container. YAML uses the same transport,
MAC verification, native API encryption, manifest and preview configuration as the
standalone client documented in `device-client/remote-display/README.md`. Publish
any configured relay/preview listening ports from the main app. View selection,
appearance and automation settings remain in CastKit's management interface.

Stop the old worker before enabling its managed replacement: two workers must not
own one device. Preserve old app configuration for rollback until fresh frame
acknowledgements and input routing are verified. The main app starts workers after
its HTTP/WebSocket server is listening. Failed workers retry independently with
backoff from one to thirty seconds; the main server and other workers stay alive.
Shutdown terminates each worker's browser process groups before closing the server.
The supervisor allows Playwright to close detached browsers after worker exit,
then kills surviving tracked groups after three seconds. Group start times prevent
killing a reused PID; a container init reaps orphaned descendants.

## Memory telemetry and sizing

An authenticated management request to `GET /api/manage/stream-workers` returns
per-device running state, PID, restarts, uptime, current RSS/PSS and observed peak
RSS/PSS, all in bytes. Linux process trees include Python, the Playwright driver
and Chromium descendants. PSS apportions shared pages; adding RSS overstates
memory when pages are shared. Peaks are sampled every ten seconds and on each
request, so brief peaks may be missed. Counters reset on app restart, while worker
restarts preserve peaks for that app lifetime. Missing/exited process measurements
are zero; this Linux telemetry is not a cross-platform capacity guarantee.

A container's memory ceiling is not its requirement. Record container usage and
per-device PSS under idle, music/artwork, temporary views and repeated interaction,
then repeat with every intended worker active. Include browser/version, viewport,
transport, sample duration, peak, restart count and headroom. Requirements cannot
be inferred from pixel dimensions alone: browser surfaces, media decoding and
channel/view complexity dominate the small final frame. Leave margin above the
largest measured total and revisit sizing when views or browser versions change.

## Cache costs and boundaries

A native 480×480 RGB565 frame is 460,800 bytes (450 KiB). Two GiB of storage could
hold roughly 4,600 raw frames before filesystem overhead. A few bounded cached
frames in server RAM cost only a few MiB; creating a separate browser page for
every possible view is much more expensive. Consolidation currently retains one
browser per worker to isolate failures; it does not claim shared-browser savings.

The device shell switches normal and composed views without reloading its document.
That preserves loaded assets and avoids the navigation/capture stall. Existing
unchanged-frame detection suppresses redundant transmissions. Extra storage does
not repair a capture timeout or a lost execution context.

Future reusable frame caching must key by dimensions, orientation, panel properties,
view/target and channel revisions, and expire changing clocks/timers. Cached touch
rectangles must belong to the exact acknowledged image: sending stale action
geometry can select a different control. Local microSD can hold fallback images,
but firmware support and measured decode/transfer latency are required before
claiming faster live interaction. Shared browser contexts or demand-driven idle
workers are separate possible savings to benchmark, not deployed behavior.

## Observed reference workload (2026-10-08)

A deployed Linux container on commit `bf0a563` ran two native stream workers with
Python Playwright 1.62.0 and Chrome for Testing 151.0.7922.34. Both stayed active;
interaction was concentrated on one device. The reference views included a
calendar/weather clock, a three-card composed view, audio-view transitions and an
external status view. These are workload observations, not hardware minimums.

| Native stream | Observed peak process-tree PSS | Observed peak process-tree RSS |
| --- | ---: | ---: |
| 480×480 RGB565, encrypted ESPHome API | 367 MiB | 582 MiB |
| 480×320 RGB565, encrypted ESPHome API | 320 MiB | 535 MiB |

Per-device peaks came from roughly six minutes of sampled telemetry, including
repeated view changes; neither worker restarted. Thirteen whole-container samples
at ten-second intervals covered a two-minute transition replay and ranged from
1.51 to 1.95 GiB. A later settled reading was 1.54 GiB. The server also rendered
other registered panels, so its baseline and the total are installation-dependent.
RSS includes shared pages more than once and must not be summed as a requirement.

**Start with a 4 GiB allowance for this tested two-stream workload**, then measure
longer under the intended media, view complexity and concurrent load before reducing
it. Leave extra headroom when adding workers. The deployment's 64 GiB ceiling was
not consumed and is not required by this reference workload. A smallest safe limit
has not been established: short sampled peaks can miss transients, and these results
do not establish long-run leak freedom or costs for untested views.
