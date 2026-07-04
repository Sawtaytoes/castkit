# The full-colour photo frame ships JPEG, not WebP, because the panel Pi is ARMv6

- **Status:** Accepted
- **Date:** 2026-07-03
- **Type:** Implementation / hardware constraint
- **Supersedes:** —
- **Superseded by:** —

## Decision

When a device's dither algorithm is **`off`** (the panel does its own
dithering — see [2026-07-02-dither-off-token-not-none-ha-reserved.md](2026-07-02-dither-off-token-not-none-ha-reserved.md)),
`ditherToPanel` no longer always emits a full-colour **RGB PNG**. The photo
(bleed) view now emits a **lossy JPEG** by default. The format (`JPEG` \| `WebP`
\| `PNG`) and lossy quality (1–100) are **Home Assistant / MQTT config entities**
— a global default on the Inkcast Server device plus a per-screen override
(`Photo Frame: Format` = `Auto` inherits the global; `Photo Frame: Quality` = `0`
inherits) — **NOT env vars** (see
[2026-07-03-user-tunable-view-settings-are-ha-config-entities.md](2026-07-03-user-tunable-view-settings-are-ha-config-entities.md)).
Every other view — and every dithered (non-`off`) render — stays lossless PNG,
so text edges and the exact panel palette are never degraded.

**WebP is a supported option but is NOT the default**, because the only
full-colour panel today (the Inky Impression 7.3") is driven by a **Pi Zero W
(ARMv6)** that cannot decode it.

## Context

Turning Dithering off made the Impression slow to receive each photo. The
cause was payload size, not resolution: with `off`, the frame is a full-colour
image at native panel size (800×480), and a photographic **RGB PNG is ~500 KB**
because PNG is lossless and photo content barely compresses. Dithered frames,
by contrast, contain only the ~6 palette colours and compress to ~15–20 KB.
The heavy PNG is what the Pi spent a long time pulling off the retained MQTT
topic. A lossy codec is the right fix here: the panel re-quantizes the image to
its 6-colour palette anyway, so lossy source detail is discarded regardless.

The request was "let the panel dither, but send WebP or JPEG." WebP was the
first choice (smaller than JPEG at equal quality). Verification against the
real panel Pi ruled it out.

## Why

- **WebP decode SIGILLs on ARMv6.** On the Impression's Pi Zero W,
  `PIL.features.check("webp")` returns **True** (the module is present), but an
  actual `Image.open(webp_bytes).load()` dies with **`Illegal instruction`
  (SIGILL, exit 132)**. The piwheels Pillow's bundled **libwebp is compiled
  with ARMv7/NEON instructions** the ARMv6 core lacks. The capability probe is
  therefore misleading — only a real decode reveals it.
- **JPEG is ARMv6-safe.** libjpeg has no such instruction dependency; the same
  Pi decodes an 800×480 JPEG cleanly (exit 0). JPEG q80 of the frame is
  ~17 KB — **~30× smaller than the RGB PNG**, which fixes the transfer time.
- **Scoped to the photo view only.** The encoding is chosen in `pushController`
  and applied solely when `getIsBleedView(activeView)` is true. A text view left
  on `off` still ships lossless PNG, so JPEG's edge artefacts never touch text.
- **WebP kept for future hardware.** A later photo panel on a **Pi Zero 2 W
  (ARMv7)** or **Pi 4 (ARMv8)** can decode WebP; set that screen's
  `Photo Frame: Format` to `WebP` in Home Assistant then (it's a per-device
  select, so other panels stay on JPEG). Nothing in the pipeline is
  JPEG-specific.

## Evidence

- On-device probe, `pi@192.168.101.200` (Impression, Pi Zero W, ARMv6),
  `~/inky-venv` Pillow 11.1.0:
  - `features.check("webp")` → `True`, but decoding a real WebP →
    `Illegal instruction` (exit 132).
  - Decoding the same frame as JPEG → `decoded JPEG (800, 480) RGB`, exit 0.
- Pipeline sizes for an 800×480 frame (`ditherToPanel`, `algorithm: "off"`):
  RGB PNG **519 KB**, JPEG q80 **17 KB**, WebP q80 **4.8 KB**.
- User request (chat 2026-07-03): "let the panel dither, but look for if we can
  send webp or json … or jpg", then selected "WebP, JPEG fallback" pending
  on-panel verification. Verification selected the JPEG fallback.
