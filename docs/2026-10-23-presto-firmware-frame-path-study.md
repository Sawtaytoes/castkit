# Presto firmware frame path — where a frame's time goes, and how to shorten it

Status: research and proposal (2026-10-23). Phase 4 of
[`2026-10-23-shared-frame-cache-plan.md`](2026-10-23-shared-frame-cache-plan.md).
Nothing here has been flashed or uploaded to a panel. Every change below needs the
owner's approval before a flash, and the flash procedure at the end pauses that
panel's worker first.

Since #300 measured the browser at 33–67 ms for a native swipe, the board is the main
cost of a swipe: a full changed frame takes ~0.15 s to inflate and ~0.37 s to draw. This
study therefore weights **shortening inflate and draw** (regions, copies, encoding) and
treats on-board frame slots as secondary.

## Summary

- **The board spends almost nothing on decompression.** Inflating a full 480×480 UI
  frame is 3.1–3.7 M Cortex-M33 instructions (~21–25 ms at 150 MHz). The other ~500 ms of
  a full frame is PSRAM traffic, fixed pauses, and the swap.
- **A full changed frame crosses PSRAM about five times.** Inflate writes a 460,800 B
  staging patch; the draw reads it and writes the back buffer; after the swap it reads
  the patch again and writes the other buffer so both stay equal. Every 960 B of every
  one of those copies also waits behind the scanout prefetch and then sleeps 50 µs.
- **Live fit (103 changed frames, 4 panels):** `draw_us = 25,276 + 286 × rows + 0.438 ×
  bytes`, `decode_us = 0.368 × bytes` (zlib). It predicts 364 ms draw and 169 ms decode
  for a full frame, matching the ~365/~154 ms reported.
- **Step A (prototyped, compiles, host-tested, not flashed):** inflate each chunk as it
  arrives straight into the back buffer, and synchronize the second buffer lazily, only
  where the next patch does not cover the previous one. Wire format, actions and
  acknowledgement are unchanged, so it needs no worker change. Expected: full frame
  **~533 → ~195 ms**, the 432×336 patch **~349 → ~132 ms**, a clock tick **~74 → ~33 ms**
  — with the production PSRAM pacing kept exactly as it is.
- **Step B** (one measured knob at a time) attacks the remaining ~0.32 µs per byte of
  PSRAM writing; the floor is ~30–50 ms for a full frame, unproven on hardware.
- **Camera:** today ≤ ~1.5 fps for a full 480×480 camera frame even on a perfect link.
  With step A and a JPEG region codec, a 480×272 camera band is **~5 fps**, ~7 fps if step B
  pays off. A zlib camera frame is ~85% of raw size (393 KB of 460.8 KB), so JPEG is the
  right payload for a camera, not zlib or RLE.
- **Frame slots** fit easily: ~6.2 MiB of PSRAM is free today, ~7.1 MiB after step A
  (14 → 16 raw frames). Showing a raw slot is a pointer swap (~25 ms). The design reuses
  the WT32's `cache` manifest entry.

## How a frame travels today

Sender (`device-client/remote-display/esphome_presto.py`): `encode_presto_patch` takes
the bounding rectangle of changed pixels against the last acknowledged frame, picks
zlib-6 or RLE, prepends `>IHHHHB` (base frame, x, y, width, height, codec), base64s the
packet and calls the `frame_chunk` API action with 4,000-character chunks (3,000 bytes),
sleeping 3 ms between chunks, then waits for the `frame,…` acknowledgement.

Board (`presto_display` component, production = `esphome-presto` `5ac7789`):

1. **Every chunk:** validate, base64-decode into a 3,000 B SRAM buffer, then
   `copy_pixels_paced` it into `packet_` (500,000 B, PSRAM). Not counted in either
   reported time.
2. **Final chunk — `decode_ms`:** `decode_pixels` allocates a 32 KiB SRAM dictionary
   (`new`, per frame), refills a 4 KiB SRAM input window from `packet_`, inflates with
   miniz `tinfl` (already in SRAM), and copies each output run into `patch_` (460,800 B,
   PSRAM) through `copy_pixels_paced`.
3. **`draw_ms`:** `memcmp` `patch_` against the back buffer row by row until one differs;
   copy `patch_` → back buffer row by row; `present(false)`; copy `patch_` → the new back
   buffer row by row so both buffers match.
4. `present` → `ST7701::set_framebuffer` copies the first 128 rows (122,880 B) of the new
   buffer into the inactive SRAM scanline bank (with a 50 µs sleep per row), publishes
   the swap, and `wait_for_vsync` blocks until the scanout takes it at the next frame
   start.

`copy_pixels_paced` moves ≤ 960 B at a time: wait for the scanout's prefetch DMA,
`memcpy` PSRAM → SRAM, wait again, `memcpy` SRAM → PSRAM, `sleep_us(50)`, poll touch. The
gate and the pause are what made native-resolution music steady (handoff record of the
16:35:02 revision): the scanout streams the front buffer out of PSRAM through the XIP
stream FIFO and loses to CPU accesses in the QMI arbiter.

The scanout itself is a fixed load. The pixel clock is 150 MHz / 10 / 2 = 7.5 MHz over a
530 × 498 timing → **28.4 Hz**, so it reads 460,800 B × 28.4 ≈ **13.1 MB/s** from PSRAM
continuously, out of a QSPI bus at 75 MHz SCK (arduino-pico divides 150 MHz by 2 for its
109 MHz PSRAM ceiling) whose raw peak is 37.5 MB/s.

## Measurements

### Live panels (read-only)

Health endpoints of the four Presto workers, sampled every 0.25 s for 25 min on
2026-10-23 inside the running CastKit container (no worker paused or restarted): 2,769
heartbeats and 103 changed frames, every one zlib. The changed frames were clock ticks
and in-view updates; no full swipe happened in the window.

| Frames | Count | decode p50 | draw p50 | ack p50 |
| --- | ---: | ---: | ---: | ---: |
| Heartbeat (1×1, unchanged) | 2,769 | 0.32 ms | 0.24 ms | 17 ms |
| Changed, < 30 KB raw (39×27 … 96×120) | 95 | 6.5 ms | 64.6 ms | 105 ms |
| Changed, 30–100 KB raw | 6 | 17.8 ms | 81.0 ms | 149 ms |
| Changed, 432×336 (290,304 B raw) | 2 | 106.4 ms | 250.8 ms | 411 ms |

Least-squares fit over the 103 changed frames (`rows` = rectangle height, `bytes` =
rectangle bytes):

| | Fixed | Per row | Per byte | Full frame |
| --- | ---: | ---: | ---: | ---: |
| `draw_us` (residual SD 10.7 ms) | 25,276 | 286 | 0.438 | 364 ms |
| `decode_us`, zlib (residual SD 0.6 ms) | ≈ 0 | — | 0.368 | 169 ms |

Read the draw terms as: **fixed** = the 128-row SRAM preload (6.4 ms of sleeps alone)
plus the wait for vertical blank (0–35 ms, mean ~18 ms); **per row** = two
`copy_pixels_paced` calls (100 µs of sleeps, prefetch gates, a touch poll every 20 ms);
**per byte** = two PSRAM reads + two PSRAM writes. A narrow, tall rectangle is therefore
expensive for its size: a 95×120 clock tick (22.8 KB) costs ~65 ms, almost all fixed and
per-row overhead.

Decode is linear in output bytes. Only ~0.05 µs/B of its 0.368 µs/B is the inflater
(next table); the remaining ~0.32 µs/B is the paced write into `patch_`, of which
0.052 µs/B is the 50 µs pause per 960 B.

### Inflate cost on the M33 (host, emulated)

The production `presto_pixels.cpp` + `miniz_tinfl.c` were compiled for Cortex-M33
(`zig c++ -mcpu=cortex_m33 -O2`) and run in Unicorn on packets made by the worker's own
`encode_presto_patch` from CastKit's public fixtures (41 480×480 UI evidence images, the
sample photos, and a synthetic fixed camera: a photo plus σ 2.5 sensor noise and a moving
block). Instructions inside `copy_pixels`/`memcpy` are counted apart, because on the
board that part is bound by PSRAM.

| Packet (full 480×480) | zlib bytes | Inflate instructions (excl. copies) | ≈ ms at 150 MHz, 1 instr/cycle |
| --- | ---: | ---: | ---: |
| UI views, 12 fixtures | 9–22 KB | 3.13–3.66 M | 21–24 |
| Photos, 4 fixtures | 177–377 KB | 12.2–14.9 M | 82–99 |
| Noisy fixed camera | 393 KB | 15.1–15.2 M | 101 |

The emulator does not model cycles; the M33 retires about one simple instruction per
cycle from SRAM, and `tinfl_decompress` already sits in SRAM (`0x20000115` in the
prototype ELF; `miniz_tinfl.c` is unchanged from production), so these are close lower bounds. The decoder is not the problem for UI
frames; for camera content it is ~100 ms, which is why camera frames need a smaller
region or a different codec (below).

### Payload sizes (worker codec, public fixtures)

| Content | Median packet | Max | zlib-1 median | RLE median | Encoding chosen |
| --- | ---: | ---: | ---: | ---: | --- |
| UI view, full frame (41) | 16.4 KB | 33.1 KB | 22.5 KB | 76.9 KB | zlib 40 / RLE 1 |
| UI view → next view (36 pairs) | 14.5 KB | 32.8 KB | 18.2 KB | 67.8 KB | zlib 34 / RLE 2 |
| Photo, full frame (7) | 177 KB | 377 KB | 204 KB | 450 KB | zlib |
| Noisy camera frame (6) | 393 KB | 393 KB | 394 KB | 459 KB | zlib |

Sensor noise makes every pixel differ from the previous frame, so a camera's dirty
rectangle is always the whole region and zlib saves ~15%.

## Where the full-frame time goes (model, current firmware)

| Part | ms | Note |
| --- | ---: | --- |
| Receive: chunks copied into `packet_` | ~6 (UI) / ~130 (camera) | ~1 ms per 3,000 B chunk; outside both reported times |
| Inflate (CPU) | ~23 | 3.1–3.7 M instructions |
| Inflate output written to `patch_` | ~146 | incl. 24 ms of 50 µs pauses |
| Draw, per-row overhead (480 rows × 2 copies) | ~137 | incl. 48 ms of pauses |
| Draw, two PSRAM copies of 460,800 B | ~202 | |
| Preload + wait for vertical blank | ~25 | incl. 6.4 ms of pauses |
| **Board total** | **~533** | |

PSRAM traffic for one full UI frame today: **~1.40 MB written and ~1.06 MB read** by the
CPU, beside the scanout's 13.1 MB/s. The useful part is one write of 460,800 B.

## What can be cut

| Lever | Saves (full frame) | Evidence / risk |
| --- | ---: | --- |
| A1. Decode straight into the back buffer (no `patch_`) | the first draw copy, ~170 ms | Back buffer is never visible; a failed decode marks it stale (step A). |
| A2. Lazy sync instead of copying every patch into the other buffer after the swap | the second draw copy, ~170 ms; 0 for a stream that redraws the same region | Copy only `stale − next` before the next decode. Host test: 2,000 random patches exact. |
| A3. Inflate each chunk as it arrives (no `packet_`) | ~1 ms per chunk, and overlap with the network | tinfl streams natively; frees 960,800 B of PSRAM. |
| A4. Allocate the dictionary once | a 32 KiB `new` per frame | Matches the WT32 decision that the receiver allocates nothing per frame. |
| B1. Pause 50 µs → 0 per 960 B (keep the gate) | ≤ 0.052 µs/B ≈ 24 ms | Pauses are part of the "music steady" fix; accept only with zero new prefetch overruns. |
| B2. Larger write batches between gates | unknown | Same acceptance as B1. |
| B3. Preload 64 rows, not 128, at the swap | ~4 ms | Prefetch already runs 64 rows ahead; set `prefetch_row = 64`. |
| B4. Write framebuffers through the uncached alias (`+0x04000000`) | unknown; cached writes allocate a line and evict code | ⚠️ coherency: every CPU access to framebuffers must then use the same alias, or lines must be cleaned. |
| B5. 200 MHz system clock | +33% QMI and CPU; scanout rises to 31.6 Hz (+11% load) | Retimes Wi-Fi PIO and the panel; full re-acceptance. Last resort. |
| C1. Several rectangles per patch (tile list) | in-view changes only | Fixture pairs: union rectangle 15–100% of the panel vs. changed 16 px tiles 9–100% (1.4–2.8× less area). Needs a new codec on both sides. |
| — Faster codec for UI | ≤ ~20 ms | Inflate is ~4% of the frame; RLE is 5× more network bytes. Keep zlib. |
| — DMA for PSRAM writes | unknown | The driver moved prefetch off direct PSRAM DMA because it stalled; not proposed. |

The theoretical floor for a full frame is one 460,800 B write at whatever the QMI gives
the CPU beside the scanout (~10–15 MB/s ⇒ ~30–46 ms) plus inflate (~23 ms) plus the
swap (~25 ms): ~80–95 ms. Overlapping inflate with the writes on the idle second core
would take it nearer ~55 ms; that is a later, larger change.

## Step A — the prototype

Code: private ESPHome config repository, branch **`research/presto-frame-path`**,
worktree `App-Configs/esphome/config/.worktrees/presto-frame-path`, directory
`presto-frame-path-prototype/`. Commit `efe96a6` is the byte-identical production
component (= `esphome-presto` `5ac7789`); commit `31216af` is the prototype on top, so
the diff is reviewable on its own. Nothing references it from a device YAML; the
production directory `presto-components-2026-10-12/` is untouched. The canonical public
home for the final change is `Sawtaytoes/esphome-presto` (its host tests and CI), after
the hardware trial.

- `presto_stream.h/.cpp` — `StreamDecoder` (zlib and RLE fed in arbitrary chunk sizes,
  written at the rectangle's stride) and `FramePair` (which buffer is front, the stale
  rectangle, `prepare(next)` copies only `stale − next`, at most four pieces).
- `presto_remote.cpp` — the first chunk's header picks the destination; patches of
  ≤ 4,096 B (heartbeats, a blinking colon) still decode to SRAM and compare first, so an
  unchanged one costs no swap, as today. Larger patches sync, then decode into the back
  buffer chunk by chunk; the final chunk swaps. A failed or stalled frame marks its
  rectangle stale; the 7 s offline blank abandons any half-received frame.
- Acknowledgement unchanged: `frame,id,touch,0,overruns,decode_us,draw_us`, where
  `decode_us` is decode work summed over chunks and `draw_us` is sync + swap.
- Optional `timing_id` text sensor ("Display Timing", its own entity so it can never
  replace a queued acknowledgement): `timing,frame,rect_bytes,decode_us,psram_write_us,
  sync_us,sync_bytes,present_us,first_to_final_chunk_ms,free_psram`. This is the
  instrument for step B and gives the first real free-PSRAM reading.
- PSRAM writes keep production's gate and pacing (`PRESTO_WRITE_BATCH` 960,
  `PRESTO_PACE_US` 50), so the first trial changes structure only.

Verification done:

- Host: 83 packets decode byte-identically to production `decode_pixels` applied to the
  same base, fed in random ≤ 3,000 B chunks and in ≤ 7 B chunks (every straddled RLE
  control word and run value); truncated and over-long bodies are rejected; 2,000 random
  patches (full swaps, repeated clock ticks, random rectangles) keep the visible buffer
  exact. On that random mix lazy sync still copied 90% of what production copies; on a
  swipe or a repeated region it copies nothing.
- Compile for RP2350 with ESPHome 2026.10.0 in the ESPHome container (`esphome compile`
  on two CPUs, compile only, generic identity `presto-frame-path-bench`): success, RAM
  93,252 B static (production's 2026-10-12 build log, an older ESPHome: 90,204 B).
- Not verified: anything on a panel.

Expected on a panel with pacing unchanged (from the live fit): decode as today
(0.368 µs/B), draw = sync (0 for a swipe) + swap (~25 ms).

| Frame | Today | Step A |
| --- | ---: | ---: |
| Full view (swipe) | ~533 ms | ~195 ms |
| 432×336 patch | ~349 ms | ~132 ms |
| 95×120 clock tick | ~74 ms | ~33 ms |
| Heartbeat | ~0.6 ms | ~0.6 ms |

## Camera frame rate

| Region and payload | Network bytes (base64) | Board time | Frames/s (board) |
| --- | ---: | ---: | ---: |
| Today, 480×480 zlib | 524 KB | ~170 + ~365 + receive ~130 | ≤ 1.5 |
| Step A, 480×480 zlib | 524 KB | ~100 inflate + ~147 write + 25 | ~3.6, if the link moves 1.9 MB/s |
| Step A, 480×272 zlib | ~296 KB | ~57 + ~84 + 25 | ~6, needs ~1.8 MB/s |
| Step A, 480×272 JPEG q75 4:2:0 | 58 KB (43 KB raw) | ~80–110 decode + ~84 write + 25 | ~5 |
| + step B at ~0.1 µs/B writes, 480×272 JPEG | 58 KB | ~80–110 + ~26 + 25 | ~7 |

JPEG was measured the same way: BitBank's JPEGDEC (Apache-2.0, as vendored by
`pimoroni-pico`) compiled for the M33 decodes a 480×272 q75 frame in 11.9 M instructions
(10.9 M at q60) and 480×480 in 14.8–20.3 M, writing big-endian RGB565 strips through a
callback straight into the destination rows. JPEG's CPU cost matches a noisy zlib
inflate, but its payload is 5–7× smaller. Wi-Fi throughput into the ESPHome API on this
board is **not measured**: the existing numbers (17 ms heartbeat round trip, 105 ms
acknowledgement for small patches) are latency, not bandwidth. Step A's
`first_to_final_chunk_ms` measures it.

Payload proposal: a codec 2 = baseline JPEG inside the existing header (rectangle = the
camera region, base = the shown frame), decoded per MCU strip into the back buffer, with
JPEGDEC's ~22 KB state and a ≤ 96 KB input buffer allocated once. The worker
encodes the camera region once per panel profile (plan phase 3) and keeps the rest of the
view as zlib patches. A higher rate than ~7 fps needs the region smaller, or tile-level
conditional replenishment (send only tiles whose change passes a noise threshold), which
is lossy and needs a periodic full refresh. Halving resolution and scaling on the board
would quadruple the rate but conflicts with the native-resolution decision for UI;
it is not proposed for anything but an explicit low-detail camera mode.

## Frame slots (secondary)

**PSRAM budget.** Production allocates two framebuffers (921,600 B), `packet_`
(500,000 B) and `patch_` (460,800 B) from the 8 MiB PSRAM heap, and nothing else uses
PSRAM (the build reports 0 B static PSRAM). Free ≈ 6.2 MiB today ⇒ 14 raw frames; after
step A ≈ 7.1 MiB ⇒ 16. This is computed from the allocations; the timing sensor reports
`rp2040.getFreePSRAMHeap()` for the real figure. Raw slots are preferred: showing one is
a pointer swap plus vertical blank (~25 ms), where a compressed slot (UI ~16 KB) costs a
full decode again (~195 ms after step A). Proposed: 4 raw slots (1.76 MiB), one per
swipe direction.

**Protocol** (extends the WT32's `cache` naming):

- Manifest `cache` entries gain `on_swipe` (`up`, `down`, `left`, `right`) beside the
  WT32's `on_tap`; `max_cache_entries` becomes a per-display limit (WT32 1, Presto 4).
- `cache_chunk(slot, frame_id, offset, final_chunk, image_data)`: a full-frame packet in
  the existing format, decoded into the slot in idle time (never while a frame or a
  contact is in progress). Acknowledged `cached,slot,frame_id`.
- `arm_cache(revision, table)`: per slot, the gesture that shows it — direction, start
  rectangle (the right-edge strip for a left pull), exclusion rectangles (sliders; the
  artwork for horizontal pulls), 48 px commit, dominant axis — mirroring `viewSwipe.ts`.
  The worker derives it from the page each time it arms, and disarms on any navigation it
  did not predict.
- On the release that satisfies an armed slot, the board swaps to it, sets the shown
  frame to the slot's `frame_id`, disarms all slots, and publishes `cache_shown,slot,
  frame_id,touch_sequence`. The touch release itself already carries the shown frame.
- The gesture is still forwarded. A swipe asks the house for a view (decision of
  2026-09-11), so the slot is an optimistic preview: the worker predicts the destination
  with `endViewSwipe`'s rule (audio cycles Now Playing ↔ Queue; time depends on the
  agenda), and if the house chooses differently the next live frame replaces it.

**Touch guard.** `FrameGuard` keeps 32 frames for 10 s from `remember`. Slot targets go
in a separate per-slot table and are re-remembered with the time of `cache_shown`, so a
slot armed a minute ago is not expired. A touch on the slot frame before the browser
reached that view still finds a different live target, and `match` already returns
`None` then — taps fail safe. After `cache_shown` the worker sets its base to the slot
frame, so the next patch is relative to what the glass shows.

**Cost and risks.** After a slot swap the old back buffer is stale everywhere; the lazy
sync copies it in idle time (~200 ms at today's rates) or skips it if the next frame is
full. Slot frames go stale (time, playback) and must be re-sent when their pixels change
(the cache key of the plan). Slot preloading competes for PSRAM with live frames, so it
runs only when idle. Gesture rules now live in two places; a mismatch shows the wrong
preview for ~0.2 s, never a wrong action.

## Recommended order

1. **Step A on one panel** (approved flash, its worker paused): measure with the timing
   sensor for a day of normal use, including Now Playing artwork; accept on zero new
   prefetch overruns and the owner's "steady" check. Then the other three.
2. **Step B, one knob per flash, measured:** B1 pause → 0, B3 64-row preload, B2 batch
   size, then B4 uncached alias. Keep each only with zero new overruns and owner
   acceptance.
3. **C1 multi-rectangle patches** (worker codec + firmware), for in-view updates.
4. **Camera region codec (JPEG)** together with plan phase 3's shared camera frames.
5. **Frame slots**, if swipes still feel slow after 1–2: after step A a slot saves the
   transfer and the ~170 ms decode of a full frame, leaving the ~25 ms swap.

## Flash and rollback procedure (for the approved trial)

1. Re-audit first: compile time and ESPHome version of each panel from its native API.
   On 2026-10-23 two panels reported compile times of 00:40–00:41 that no record
   explains; find what recompiled them before flashing anything.
2. Back up: the panel's current `firmware.bin`/`.uf2` from its build directory plus
   SHA-256, beside the existing protected native-stable backups.
3. Copy the prototype component to a new dated directory beside
   `presto-components-2026-10-12/` (never edit the production directory), and point only
   the trial panel's YAML `external_components` path at it. Add the Display Timing text
   sensor and `timing_id`.
4. `esphome compile` that YAML; verify the embedded compile time, the native action
   names, and the SHA-256.
5. Pause only that panel's worker. The handoff requires this (an OTA while frames stream
   timed out in preparation), but it does not record the mechanism used on October 8 and
   22; confirm it with whoever ran it before relying on one. Do not restart the CastKit
   app or other workers.
6. Encrypted OTA (`on_begin` pauses the scanout, as in production). Expected ~9–11 s.
7. Resume the worker; verify native identity, fresh `frame` acknowledgements, a `timing`
   report, and the free-PSRAM figure.
8. **Rollback:** point the YAML back at `presto-components-2026-10-12`, pause the worker,
   OTA the backed-up production binary, resume. If OTA cannot complete, USB BOOTSEL with
   the protected UF2 (needs physical access).

## Uncertain or not measured

- Every board-side number for step A and later is a model from the live fit and
  emulated instruction counts, not a measurement on a panel.
- Achievable PSRAM write rate beside the scanout (the floor above) is an estimate from
  QMI timings; B1–B4 may give anything from nothing to ~3×.
- Whether removing the pauses (B1) brings back the music-time scanout jumps.
- Cache coherency of the uncached alias (B4) with the XIP stream and cached reads.
- Wi-Fi throughput to the ESPHome API, which bounds every camera figure.
- JPEGDEC cycles: counted without its Cortex-M4 SIMD path and with code in SRAM; its
  tables live in flash on the board, so real time may be higher.
- No full-swipe frame occurred in the 25-minute sample window; the full-frame row comes
  from the fit and agrees with the previously reported 154/365 ms.

## Reproduce

`presto-frame-path-prototype/bench/run.sh <castkit checkout> <scratch>` builds the
payloads from CastKit's public fixtures, the host decoder benchmark, the streaming
decoder tests, and the M33 instruction counts (needs Python with numpy, Pillow,
pyelftools, Unicorn and the `ziglang` wheel; run it under the build budget).
`bench/m33_jpeg_harness.cpp` builds the JPEGDEC count the same way against
`pimoroni-pico/libraries/jpegdec`.
