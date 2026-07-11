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
