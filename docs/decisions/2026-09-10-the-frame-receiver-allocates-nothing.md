# The ESPHome frame receiver allocates nothing per frame

- **Status:** Accepted
- **Date:** 2026-09-10
- **Type:** Correctness
- **Supersedes:** —
- **Superseded by:** —

## Decision

`castkit_display` takes two buffers from PSRAM once, in `setup()`, and every
frame is written into them in place:

| Buffer | Capacity | Holds |
| --- | --- | --- |
| `encoded_` | 160,000 B | the base64 chunks as they arrive over the API |
| `payload_` | 120,000 B | the compressed frame, decoded out of `encoded_` |

`frame_chunk` `memcpy`s each chunk to `encoded_ + encoded_size_`. The FreeRTOS
queue carries a 16-byte `FrameJob` by value instead of a heap-allocated pointer,
and `decode_frame` base64-decodes straight from `encoded_` into `payload_`. The
internal-RAM scratch buffers, the accumulating `std::string` and the `new
FrameJob` are all gone. The receiver's size limit is unchanged, so no frame that
used to be accepted is refused.

`frame_chunk` also takes `esphome::StringRef` rather than `const std::string &`.

## Context

A WT32-SC01 Plus running this receiver rebooted every twenty to thirty seconds
while it showed the Now Playing view, and only that view. The panel went black
for about two seconds each time and came back. Decoded from the device's own
crash dump:

```
Reason: Abort
Crashed core: 1
panic_abort  <- abort  <- __wrap___cxa_allocate_exception
             <- operator new(unsigned int)
             <- std::string::_S_allocate <- _M_create <- _M_mutate <- _M_append
             <- CastKitDisplay::frame_chunk  (castkit_display.h:68)
```

Line 68 was `encoded_.append(encoded)`. `operator new` could not find the block,
threw `std::bad_alloc`, and an ESP-IDF build has exceptions off, so the throw
aborted.

The arithmetic explains why only one view triggered it. The nine-row rip view
compresses to about 10 KB, which is 13.4 KB of base64: two 12,000-byte chunks, so
`std::string` grows 12,000 → 24,000 and asks internal RAM for 24 KB. Album art
takes the Now Playing payload to 22 KB, which is 29 KB of base64: three chunks,
so the string grows 12,000 → 24,000 → 48,000 and asks for one contiguous **48 KB**
block — once a second, while the decode task still held roughly 51 KB of the
previous frame in two more internal-RAM allocations. Free internal RAM read
about 150 KB, but that is the total, not the largest free block; Wi-Fi, TLS,
MQTT and the API had taken theirs, and the heap was fragmented by exactly this
per-frame churn.

Binding the API action's `StringRef` to a `const std::string &` parameter built a
further 12 KB internal copy for every chunk, which is three more per frame.

## Why

A display receiver has a known worst case and a fixed frame rate. Sizing for it
once, out of the memory that is plentiful, removes the failure instead of making
it rarer: a fixed buffer cannot fragment and cannot fail to allocate. Raising a
threshold or shrinking the payload would only have moved the reboot further out.

PSRAM was the right pool for both buffers. The original comment warned that
decoding out of PSRAM means byte-at-a-time access, but the ESP32-S3 caches PSRAM
and the access here is sequential, so the warning did not survive measurement
(below). Internal RAM could not have held a persistent 120 KB anyway.

## Evidence

Measured on the same panel, same view, before and after — read out of the
receiver's own `Display Events` telemetry, which reports per-frame timings and
free memory:

| | base64 | inflate | draw | free internal | free PSRAM |
| --- | --- | --- | --- | --- | --- |
| Before | 39.4 ms | 36.0 ms | 44.4 ms | 151,824 B | 1,470,440 B |
| After | 31.8 ms | 36.5 ms | 44.4 ms | 153,160 B | 1,185,760 B |

Decoding from PSRAM is **faster**, because dropping the internal copy of the
input removed more work than the cache misses added. PSRAM falls by 284,680 B,
which is the two new buffers. Internal RAM is slightly up.

Stability, same view and same payload size, renderer log:

- Before: a session ended with `TimeoutError` every 15–30 s, twenty-plus times
  per hour, and the device also refused new API connections for minutes at a
  stretch and dropped its MQTT session.
- After: 333 frames with zero session drops, zero reboots, and no MQTT
  interruption.

The device had also logged `safe_mode: Last reset too quick; invoke in 4
restarts` — it was four crashes away from booting into safe mode.
