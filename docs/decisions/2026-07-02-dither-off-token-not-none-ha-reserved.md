# The "no dithering" option is labeled `off`, not `none` (HA reserves `none`)

- **Status:** Accepted
- **Date:** 2026-07-02
- **Type:** Product behavior
- **Supersedes:** [2026-07-02-none-dither-panel-native.md](2026-07-02-none-dither-panel-native.md)
- **Superseded by:** —

## Decision

The escape-hatch dither option that skips our palette quantization and hands the
panel a full-colour image (so its own controller dithers) is named **`off`**,
not `none`. It is still the first entry in `DITHER_ALGORITHMS` and behaves
exactly as the superseded decision described — `ditherToPanel` returns the
downscaled, tone-adjusted RGB PNG (brightness/saturation still apply, rotated to
the mount orientation). Only the token/label changed: `none` → `off`.

## Context

The option was originally called `none`. In Home Assistant an MQTT `select`
entity has no separate label vs. payload — the option string **is** the payload
— and HA reserves the payloads `none`/`None` as its `PAYLOAD_NONE` sentinel
meaning "reset to unknown". So when the server published `none` on the retained
state topic, HA silently coerced it to `None` and the "Display: Dither" select
showed `unknown` instead of the selection. Every other algorithm round-tripped
fine; only the reserved word broke.

Verified against live HA: `select.inky_phat_dither` /
`select.inky_impression_7_3_dither` sat at `unknown` with a correct options list,
and `none` never appeared in their state history (no "invalid option" warning
either — the tell-tale of the silent `PAYLOAD_NONE` branch rather than a rejected
value). The Inkcast code accepted, persisted, published, and rendered `none`
faithfully; HA was discarding it.

## Why

The maintainer's intent was an escape hatch that turns *our* dithering off and
lets the panel handle it — the exact string didn't matter. `off` is
unreserved, round-trips cleanly through HA, and reads correctly ("dithering
off"). Renaming the token is a smaller, clearer change than translating a
reserved word at the MQTT boundary.

## Evidence

> "For some reason, selecting 'none' shows 'unknown'. We should fix that."

— maintainer, 2026-07-02 (chose the label `off` when told `none` is reserved by
Home Assistant and cannot be a `select` option)
