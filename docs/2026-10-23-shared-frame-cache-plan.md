# Shared frame cache and instant image-stream navigation — plan

Status: in progress (2026-10-23). Decision:
[`2026-10-23-a-cached-frame-is-keyed-by-what-changes-its-pixels`](decisions/2026-10-23-a-cached-frame-is-keyed-by-what-changes-its-pixels.md).

## Goal

An image-stream panel (a 480×480 Presto, the 480×320 WT32) switches views as fast as
a browser panel, never shows a loading state, and plays a shared camera view as fast
as the panel can draw. Work that several panels share is done once.

## What the time goes to today

Measured on a 480×480 Presto stream (2026-10-22 and 2026-10-23):

| Step | Time |
| --- | ---: |
| Stream browser builds the destination view after the swipe | ~0.6 s |
| Capture + RGB565 encode in the worker | ~0.05 s |
| Board: inflate a full changed frame (miniz) | ~0.15 s |
| Board: draw a full changed frame to the panel | ~0.37 s |
| Request to first changed-frame acknowledgement | 0.8–1.5 s |

Loading states were also sent as frames, each costing the board ~0.5 s before the real
view; #297 holds them back.

**Correction (2026-10-23, measured).** The ~0.6 s "builds the destination view" row is
wrong for every swipe a panel makes today. In a browser with the worker's exact context
(480×480, scale 1, touch, mobile, reduced motion) against the e2e server, timed from the
`touchEnd` the worker dispatches:

| Swipe | Loading state shown | New view in the DOM and settled |
| --- | ---: | ---: |
| Native view (Now Playing, Queue, Calendar, Ambient), 5 runs | 15–27 ms | 33–67 ms |
| Composed view opened, already prepared (2 runs) | — | 24–41 ms |
| Composed view closed (2 runs) | — | 172–179 ms (160 ms is `DeviceContent`'s deliberate hand-off delay) |

So the browser is not the slow part. What is left of a swipe is the worker's own cycle
(up to 125 ms at 8 fps, because a held page waited out a whole cycle before it looked
again — fixed in the same pull request as this correction by polling a held page every
20 ms) and the board: a full changed frame costs ~0.15 s to inflate and ~0.37 s to draw,
and a production patch of 432×336 was acknowledged in 387–434 ms.

Identical panels: several installations share one panel model, the same display
properties and the same view list. Each runs its own worker and browser, so the same
view is built, captured and encoded once per panel, and a shared camera snapshot is
fetched and encoded once per panel.

## The keying rule

A cached frame is keyed by **everything that changes its pixels and nothing else**:
the panel profile (size, shape, color, rotation, contrast, dithering and other display
properties), the view definition, the bound channel data and status, the time state of
time-driven panels, and the device ID **only** when the view resolves device-scoped
content (a device-context target, a per-device player or reader). Two panels with the
same key share one render and one buffer. Everything is held in memory, bounded, and
never written to disk.

## Phases

1. **Key-addressed frame store.** Generalize the request-display cache (#298) from
   one entry per device to entries per key with a device → key index, so identical
   keys share one render and one buffer. Apply the same store to update-display pushes
   so a burst of identical renders in one second renders once.
   - **Built 2026-10-23.** `packages/server/src/render/frameStore.ts` holds entries per
     key plus a device → key index. An entry lives only while some display's current key
     names it, so the store never holds more entries than displays (plus renders in
     flight); no LRU of released entries, because no measured state returns to an old
     key soon enough to pay for one. The platform key (`platformFrameKey.ts`) and the
     render settings name no device: `id`, `label`, `mac`, `photoPeople` and `renderOn`
     are dropped. A Satori view's key is its inputs by value (each display's own Home
     Assistant data included), the minute, and the agenda's upcoming count, and the
     render draws at the instant the key read. `pushDevice` renders every image display
     through the store, so the clock tick and an identical data push in one minute render
     once; the unchanged-image skips are untouched.
   - **Why one capture can serve two displays.** The capture URL's `?device=` only picks
     the display properties (already in the key) and passes the assignment check; the
     page's device socket (`/d/<id>/ws`) refuses an image display; every channel a view
     reads is named in the view. `sharedCapture.test.ts` checks the server half: two
     identical displays on one screen get one key and byte-identical capture snapshots
     that never name either display. Locally, two real Chromium captures of two such
     displays were byte-identical (913 bytes, same SHA-256). A view that resolves content
     BY device must add the device ID to the platform key.
2. **Pre-rendered stream frames — built 2026-10-26 (un-deferred).** It was deferred on
   2026-10-23 because, sent as a live frame at release, it saved only 30–60 ms of a
   ~700 ms swipe: the board's transfer, inflate and draw of a full frame dominated. Panel
   firmware with frame slots (phase 4b, `Sawtaytoes/esphome-presto` #3) removes that
   cost — a frame already in a slot is shown with a pointer swap at the next vertical
   blank — so a frame drawn ahead is now the whole swipe instead of a sliver of it. The
   owner still measured swipes at 670–740 ms touch to acknowledgement and asked that no
   swipe show a loading state. Decision:
   [`2026-10-26-a-swipe-destination-is-drawn-ahead-and-held-on-the-panel`](decisions/2026-10-26-a-swipe-destination-is-drawn-ahead-and-held-on-the-panel.md).
   - **Server.** `packages/server/src/browser/streamFrames.ts` and
     `streamFrameService.ts`. For each image-stream panel whose worker is listening, the
     destinations of one and two swipes (`listSwipeDestinations`, at most six — the slot
     count) are captured in the worker's own browser context (480×480, scale 1, touch,
     mobile, reduced motion; same CDP screenshot call; the worker's `TARGETS_SCRIPT`,
     checked equal by a test) from a one-time capture page that serves the exact keyed
     snapshot. Keys follow the phase 1 rule: the snapshot without the device's name, id
     or preload list, Now Playing without its progress, plus the minute for clock views.
     Identical panels share one render and one buffer. A render runs only when a key
     changes (a device broadcast, a platform channel the destination reads, or the
     minute for a clock view), one at a time, and only while a worker holds the index
     request open (`/d/<id>/stream-frames`, long-poll, 25 s). Nothing is written to disk;
     a frame lives while some panel's destination names it.
   - **Worker.** `stream_frames.py` holds the index request open and fetches only
     changed frames. At every contact release (the stage gesture and every native touch)
     the worker reads the page's last request, `window.__castkitNavigation`, and if the
     contact made it, stops
     the pull hint frame still in flight, drops frames captured before the release, and
     shows the destination: `show_slot` when a confirmed slot holds that key, otherwise
     the frame drawn ahead as a live frame (firmware without slots). The destination is
     held until the live page is settled, has every image on the glass loaded, and has
     been quiet for 0.15 s; the live capture then patches against it. Slots load only while the panel is quiet and stop between
     chunks for any live frame or touch.
   - **Pixel parity.** `e2e/streamFrames.spec.ts` captures the panel page in the
     worker's context and requires the server's frame to be byte-identical, for Now
     Playing and for a Queue reached by switching views in place.
   - The left swipe goes through Home Assistant, which picks a per-room view; it is
     drawn ahead only after the server has seen which target that panel's left swipe
     opens. It is not drawn from the start: `leftSwipeViewId` names the request, not
     the target the house answers with, so a guess could show another room's board at
     release ([decision](decisions/2026-10-26-every-released-request-shows-its-destination-until-the-view-is-built.md)).
3. **Shared camera frames.** A camera view on several panels is fetched, scaled and
   encoded once per panel profile and sent to every panel showing it, without a browser
   capture per panel. The board's inflate + draw (~0.5 s per full frame) then limits the
   frame rate, which phase 4 addresses.
   - **Built 2026-10-26, without a browser or a render engine.** Decision:
     [`2026-10-26-the-camera-alert-streams-directly-and-lasts-while-a-person-is-detected`](decisions/2026-10-26-the-camera-alert-streams-directly-and-lasts-while-a-person-is-detected.md).
     `packages/server/src/platform/sources/homeAssistantVideo.ts` reads Home Assistant's
     low-latency HLS parts (blocking playlist reloads, from the newest independent part)
     as one fragmented MP4 stream. `packages/server/src/camera/cameraDecoder.ts` decodes it
     with one ffmpeg per camera (10 pictures per second, at most 480 px, two decode
     threads, PAM out) and `framePacer.ts` spreads each part's burst over the time it
     covers. `cameraFrameService.ts` composes each profile once (`cameraFrameLayout.ts`:
     480x480 keeps the 4:3 picture whole under a label band and patches only the camera
     rectangle; 480x320 overlays the label and patches the whole frame), with the label
     and receipt time drawn by resvg from the panel face. Stills cover the start; decoding
     stops 15 s after the last read.
   - **Worker.** The alert page marks its section with `data-castkit-camera-frames`.
     `camera_frames.py` long-polls that URL with the page's cookie, and the worker sends
     each frame unchanged while the feed is fresh (4 s), the page is settled, and no touch
     is active; otherwise it captures the page as before.
   - **Measured on panels, 2026-10-26** (one Presto per run, a 25–45 s test override).
     A healthy link: 1.39 FPS steady, 56 frames in 40 s, every frame the server's
     480x360 patch (~161 KB zlib). Per frame ~650 ms: ~450 ms on the link, ~165 ms inflate
     (`decode_us`), ~40 ms draw. Before this change the same panels drew 0.69–0.99 FPS.
     Server: the frame service at one panel's rate costs ~10% of one core plus ffmpeg ~7–8%
     (measured in the running container); it decoded 9.9 pictures per second for three
     readers at ~43% of one core. A weaker link drew 1.28 FPS in one run, but in two of three
     runs its first 160 KB patch stalled the link past the board's 3 s chunk limit and the
     board left the network for ~75 s. The link is the limit, so phase 4 adds a JPEG patch.
   - **JPEG patches (codec 2).** A board whose firmware reports `jpeg` on its
     `Display Codecs` entity gets the camera rectangle as a baseline JPEG (quality 75, about
     a fifth of the bytes); every other board keeps zlib. The server encodes each profile's
     JPEG once, only when a reader asks for it (`codec=jpeg`).
4. **Panel firmware — the main remaining cost of a swipe.** (a) Measure and shorten the board's inflate and draw path
   (partial regions, faster copy) — this is the camera frame rate. (b) Frame slots in
   PSRAM: the worker preloads the destination frame of each swipe direction, and the
   board swaps locally on the gesture with no network round trip. Requires OTA of each
   panel; the worker is paused first.
   (b) is built in `Sawtaytoes/esphome-presto` #3; the worker uses it when the board
   offers `show_slot` (see phase 2). Study and proposal:
   [`2026-10-23-presto-firmware-frame-path-study.md`](2026-10-23-presto-firmware-frame-path-study.md).
   Inflate is ~4% of a full frame; the rest is PSRAM copies, pauses and the swap.
   Decoding straight into the back buffer with a lazy second-buffer sync is expected to
   take a full frame from ~0.53 s to ~0.2 s with no wire-format change.

## Verification for each phase

Measure on a real panel, not only in tests: swipe release to first changed-frame
acknowledgement, camera frames per second, worker and server CPU, and container memory
over time. Record numbers in the phase's pull request.
