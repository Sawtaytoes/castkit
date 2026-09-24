# A new build reloads a live-browser panel

- **Status:** Accepted
- **Date:** 2026-09-23
- **Type:** Deployment / client lifecycle
- **Supersedes:** —
- **Superseded by:** —

## Decision

The server stamps a content hash of the Slatecast bundle it serves into every
snapshot. A panel compares that against the hash baked into the page it loaded
and reloads itself when the two differ.

Three properties are load-bearing:

1. **A content hash, not a start timestamp.** Restarting the same image must not
   reload every display in the house, and a container that restart-loops must
   not reload them repeatedly.
2. **A missing id means "do not reload", on either side.** A page served before
   this field existed carries no id, and a server with no build to hash reports
   none. "Cannot tell" is not a reason to reload a wall panel.
3. **One reload per page load.** After a reload the page carries the server's
   current id, so nothing repeats. The flag is what stops a display
   reload-looping if the ids ever cannot agree, because a looping wall panel
   cannot be fixed from a phone.

A view whose `clientId` this bundle does not have no longer falls back to Now
Playing. It renders `This display is out of date`. A current bundle cannot reach
that state; it is there so the next mismatch names itself.

## Context

The Printer Status view was deployed on 2026-09-23. The workbench panel's
Chromium had been running since 2026-09-21, and it never reloaded — a deploy
restarts the server, the panel's socket reconnects, and the page stays exactly
as it was.

Home Assistant selected `Printer Status`, the server pushed the view and the
printer payload, and the panel answered every push. Its bundle had no
`printer-status` view, the fallback was Now Playing, and the glass read
`Nothing playing` while two prints ran on the machines beside it.

Nothing in the chain was wrong. The MQTT payload carried both printers, the
select entity read `Printer Status`, the container ran the new image, and the
server rendered the view correctly when asked for the same page in a fresh
browser. Only the panel was old, and nothing said so.

The gap was already known and written down twice. `browserMode.ts` says "the HA
Reload button is the cache-buster", and `BrowserDeviceProfile` carries two
deprecated aliases kept "so a kiosk still running the pre-2026-09-14 bundle
keeps working across a deploy", to be dropped "once every panel has reloaded".
Both put a person in the loop. Nobody is in that loop.

A browser panel is therefore verified **on the panel**, not by loading its `/d/<id>`
page somewhere else. That page is the server rendering the current bundle on demand and
says nothing about what the glass is running. The Pi panels run Wayland, so `grim` over
SSH reads the real framebuffer.

## Why

- **A deploy is not finished at the container.** The panel is the product. A
  redeploy that leaves the glass on last week's bundle has not shipped anything.
- **The failure is silent and it reads as the opposite of itself.** An idle
  panel looks like no job. Two prints were running.
- **The manual step does not scale to the fleet.** Four browser panels, and the
  person who has to remember is the one who never opens these repos.
- **The page and the panel had drifted apart with no way to notice.** The Printer
  Status work was verified by loading `/d/slate-617e01` in a browser, which showed both
  cards and was an honest check of everything except the one thing that was wrong.
- **It retires the compat aliases.** `colour` and `legacyShape` exist because an
  old bundle could outlive a rename. A bundle that reloads itself cannot.

## Evidence

Owner, T3 Code chat `t3code-8bac855e`, 2026-09-23:

> Screen isn't correct for 3D Printers. There's a job active, and it isn't
> showing it

Measured the same date, before any change:

- `sensor.magi_3d_printer_print_status` and
  `sensor.foopie_3d_printer_print_status` both `running`.
- The retained `castkit/slate-617e01/printers/set` payload carried both
  printers, with progress, layers, plate pictures and filament.
- `select.basement_3d_printers_workbench_display_view` read `Printer Status`.
- `https://castkit.octen.dev/d/slate-617e01`, loaded in a fresh browser at
  1280 x 720, rendered both cards correctly.
- `grim` on the panel itself showed `Nothing playing`.
- The panel's Chromium had been up since 2026-09-21;
  `button.basement_3d_printers_workbench_display_reload` had last been pressed
  on 2026-09-12.

Pressing Reload fixed the panel immediately, which confirmed a stale bundle and
nothing else.
