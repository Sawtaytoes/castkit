# Vendored M5Paper components — patches

`it8951e/` and `m5paper/` are copied from
[ilia-ae/m5paper_esphome](https://github.com/ilia-ae/m5paper_esphome)
(`components/`, main branch). That upstream was last updated early 2025 and does
**not** compile on current ESPHome (2026.6.5) unformodified — the display
`config` validates, but the C++ build fails. We vendor + patch instead of
pulling it over `external_components: type: git` so the fix is pinned and the
config actually builds.

## Patches applied

### it8951e/it8951e.h — drop stale `override`
ESPHome removed `Component::get_loop_priority()`, so the override no longer
overrides anything and the compile errors with:

```
error: 'float esphome::it8951e::IT8951ESensor::get_loop_priority() const'
marked 'override', but does not override
```

Fix (line ~25):

```diff
- float get_loop_priority() const override { return 0.0f; };
+ float get_loop_priority() const { return 0.0f; };
```

Verified: `esphome compile m5paper.yaml` → "Successfully created ESP32 image /
SUCCESS" on ESPHome 2026.6.5 (target chip ESP32-D0WDQ6, board `m5stack-grey`).

## Refreshing from upstream
If a newer upstream fixes this, re-copy `components/{it8951e,m5paper}` and drop
the patch — but re-run `esphome compile` first; assume it still needs work.

### it8951e — add `it8951e.fill_dark` (ours, not upstream)

Upstream can only clear to white: `clear()` writes `0xFFFF` over the controller's
image memory and runs the INIT waveform. A panel defect that is LIGHTER than its
surroundings is invisible on a white panel, so that wipe cannot be used to test
for one. The Office M5Paper's hairline is light, and it passed a white wipe while
being plainly visible on content.

`fill_panel(uint16_t word)` writes any constant over the image memory and paints
it with GC16. `FillDarkAction` calls it with `0x0000`, which is black on this
path (it does not apply the `reversed_` inversion that `write_buffer_to_display`
does). Nothing from the display buffer, the dirty rectangle or the image decode
reaches the glass, so a mark that survives it cannot come from anything the node
draws.

Added files: `it8951e.h` (declaration + `FillDarkAction`), `it8951e.cpp`
(`fill_panel`), `display.py` (registers `it8951e.fill_dark`).

### it8951e — feed the task watchdog inside every long SPI loop (ours, not upstream)

A full 960x540 frame is 129,600 SPI transactions in one `for` loop, with
nothing yielding to the scheduler. On the Office M5Paper that starves the loop
task past the ESP-IDF task watchdog's 5-second timeout and reboots the board:
`Reason: Task wdt`, crashing inside `write_byte16()` below
`write_display_slow()`.

⚠️ **It also rolls an OTA back.** The crash lands inside the validation window,
before the new image is marked good, so a flash that reported `OTA successful`
came back running the old firmware and reported
`OTA rollback detected! Rolled back from partition 'app1'`. The upload looks
like it worked and the change is simply absent.

`App.feed_wdt()` now runs every 256 words in `write_buffer_to_display`,
`clear()` and `fill_panel()`, and on every pass of `check_busy()`. Upstream's
callers all pass the 30 ms default and cannot reach the timeout; `fill_panel`
waits for a real GC16 waveform and needs an explicit 10,000 ms, which is only
safe because the loop feeds.

⚠️ **This is not the fix for the underlying defect.** The Office M5Paper also
logs `Pin busy timeout` on the GPIO27 busy read, and the repaint durations are
bimodal — 104 passes over 7 s, 107 under 5 s, nothing in between. Feeding the
watchdog stops the reboot; it does not make the panel read its busy line. That
fix needs a component patch, because `setup()` forces `FLAG_INPUT`.

Changed file: `it8951e.cpp`.
