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
