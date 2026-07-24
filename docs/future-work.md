# Future work (maintainer-requested, explicitly deferred)

Ideas the maintainer asked to document but NOT build yet. Check
[decisions/](decisions/README.md) before starting any of these.

## Photo Frame: photo year/date overlay (2026-07-02)

Show when the current photo was taken, "especially in the larger screen" —
the year (or full date) somewhere unobtrusive on the Photo Frame view. The
asset's `fileCreatedAt` already rides through the Immich pool entries
(`AssetPoolEntry.createdAtMs`), so it mostly needs a view treatment that
survives dithering on top of an arbitrary photo (corner chip/strip?).
Maintainer: "I don't wanna mess with that tonight. Document it as future
work."

## Weather presentation ideas (2026-07-02)

The first cut ("Clock (Weather)") shows temperature + condition text.
Maintainer brainstormed, in his words, a few ways it could grow:

1. **A weather icon** next to/instead of the condition text.
2. **Condition-driven background** — the view's backdrop represents rainy /
   sunny / etc.
3. **Temperature by itself or beside an icon** (partly done — text version).
4. **A forecast view** — a separate view HA automations could rotate in
   "every so often and goes away" (the View select is already automatable, so
   this is just a new view + an automation).

## UniFi Protect presence → Photo Frame people (2026-07-02)

"Figuring out who's home via UniFi Protect and making sure those folks are in
the list of photos." The building block shipped tonight: `Photo Frame:
People` / `Photo Frame: Query` are plain HA text entities, so an HA
automation can rewrite them from any presence signal (Protect face
detections, device_trackers, etc.) and the frame refreshes immediately.
Remaining work is HA-side: derive a who's-home list and template it into
`text.inky_impression_7_3_photo_frame_people`.

Related maintainer scenario, same mechanism: seasonal/scheduled queries —
"during St Patrick's Day, only find pictures of people in a 'green shirt',
and then have Home Assistant reset it back to my kids after. I could even
have it change from my kids to just any picture once the kids are in bed."

## Now Playing: collapse to one design? (2026-07-02)

Maintainer leaning toward keeping only the Dashboard design and renaming it
"Now Playing", but wants to test Editorial/Poster on the big panel first.
Keep all three until he decides (see
[decisions/2026-07-02-title-above-artist.md](decisions/2026-07-02-title-above-artist.md)).

## LED-matrix panels as a third client mode (DDP sink) (2026-07-24)

Maintainer owns addressable LED-matrix panels currently driven by **WLED**, and
wants a possible future CastKit edition documented — not built. Someone linked
[pavlov-net/media-proxy](https://github.com/pavlov-net/media-proxy) (Rust; streams
video/YouTube to LED matrices via **DDP**, a UDP pixel-push protocol) as a
prompt for the idea. That project is *not* a CastKit dependency and is unrelated
to Chromecast/Cast despite the name; it's relevant only as a **reference DDP
sender** (packet spreading, pacing, redundancy) and fit/crop/dither pipeline.

**Why it fits cleanly.** An LED matrix is just another `image`-mode dumb sink —
"who renders" is the server, exactly like Inkcast. The device model already
covers it: a matrix is a small **full-colour `rect`/`square`** panel declaring
tiny `width`/`height` (e.g. 32x32) in the devices file. The render path also
largely exists — downscale a React view to the panel grid and emit RGB via the
existing dither-**off** path (see
[decisions/2026-07-02-dither-off-token-not-none-ha-reserved.md](decisions/2026-07-02-dither-off-token-not-none-ha-reserved.md));
the panel/LED does its own final handling. Static views (a 32x32 Now Playing
chip, a weather glyph, an ambient palette) would push on data change just like
e-ink.

**What's genuinely new (the deferred work).**
1. **Transport departs from the MQTT-only contract.** DDP is UDP sent directly
   to the panel's IP, so the *pixel* path is no longer "MQTT and nothing else"
   (data/commands/discovery would still be MQTT/HA). Needs a `@castkit/*` DDP
   sender package — media-proxy is the reference impl. WLED already accepts DDP
   realtime packets, so CastKit could become just another DDP source **without
   reflashing** the panels — WLED stays usable for its own effects.
2. **Static vs. motion is a fork.** Rendered static frames fit the existing
   pipeline. Full **video/YouTube** (continuous 30–60fps, ffmpeg + hardware
   decode) is a much bigger lift and squarely media-proxy's domain — treat as a
   separate, later phase, not part of a first matrix mode.
3. **Naming.** Modes are branded after products (Inkcast/Slatecast). A matrix
   mode would want a sibling name in that scheme — leave to the maintainer, do
   not coin one.

Open question to settle first: is this a new client `mode` alongside
`image`/`browser`, or `image` mode with a pluggable transport (retained-PNG-MQTT
vs. DDP-UDP)? The latter is less surface but breaks the current one-transport
assumption in `@castkit/shared`.

## Earlier deferrals (from HANDOFF)

- Web config UI (Jotai or Redux-Toolkit noted for the stores).
- MQTT TLS on 8883.
- Progress text ("2:14 / 4:05") on the Dashboard — NO animated progress bars
  (e-ink refresh constraints).
