# The M5Paper is sent sixteen gray levels, not one bit

- **Status:** Accepted
- **Date:** 2026-09-17
- **Type:** Device capabilities / Render pipeline
- **Supersedes:** [2026-07-08-m5paper-image-plus-touch-plus-fast-update.md](2026-07-08-m5paper-image-plus-touch-plus-fast-update.md) — point 1 only, the 1-bit render. Touch and fast-update stand.
- **Superseded by:** —

## Decision

**The M5Paper is a `grayscale` panel and is sent all sixteen of its levels.**

- `M5PAPER_DEVICE` carries `colorMode: "grayscale"` and `GRAYSCALE16_PALETTE` —
  sixteen neutral steps `n × 17`, black first, white last. `ColorMode` gains
  `"grayscale"` on the image-device axis, where the browser-device axis already
  had it; `PALETTE_BY_COLOR_MODE` is the one place a mode becomes a palette.
- The firmware decodes the render as `type: GRAYSCALE` (8 bits per pixel,
  518,400 bytes in PSRAM) and the vendored it8951e driver keeps the top nibble of
  each level: `0x0F - (color.r >> 4)`. `(n × 17) >> 4 === n`, so every server
  level lands on its own panel step.
- A view lays out for `grayscale` exactly as it does for `monochrome`. The intent
  scale is still one ink; `EPAPER_PALETTE_BY_COLOR_MODE.grayscale` is `"mono"`
  and `READABLE_FONT_FLOOR_PX.grayscale` is 15. Only the quantize step differs.
- The **1-bit path is not kept as an option for this panel.** The admin panel's
  "Mono" choice still exists for a panel that is mono; setting it on the M5Paper
  is the old behaviour, not a supported mode.

## Context

The IT8951E has always painted 4 bits per pixel. `write_buffer_to_display` sets
`m_pix_bpp = IT8951_4BPP` on every path and `write_display_slow` paints with the
GC16 waveform — the sixteen-gray one. CastKit dithered to two colours and the
firmware decoded `type: BINARY`, so the panel received sixteen-level words that
only ever held 0x0 and 0xF, at the full 4-bit transfer cost and the full GC16
refresh time. The owner asked on 2026-09-17: *"Is it just me or are we sending
1-bit images to M5Paper? I believe that screen supports 16-gray, a feature we
currently lack"* and *"If we support that, we can probably reduce dithering."*

The 2026-07-08 record chose 1-bit to keep the decode buffer in internal RAM
("BINARY, no PSRAM dependency"). `m5paper.yaml` has enabled `psram:` since the
esp-idf move, so that reason no longer held.

## Why

**Two levels wasted a budget the panel was already paying for.** Sixteen levels
mean a photo's tone is carried by the ink rather than by error-diffusion
speckle, and an anti-aliased letter edge keeps its gray instead of turning
into a two-tone stipple. The refresh cost does not change: GC16 was already
the waveform and 4bpp was already the wire format.

**Two traps had to be cleared, and both would have produced a black-and-white
panel with no error to explain it:**

1. **The vendored driver could not draw gray.** Upstream's
   `draw_absolute_pixel_internal` read `color.raw_32 & 0x0F` — the LOW nibble of
   the red channel. Exact for 0x00 and 0xFF, which is all a BINARY image ever
   sends, and non-monotonic in between: 0x80 painted black, 0x8F painted white.
   The patch keeps the top nibble and inverts once, so the display lambda's
   deliberate `COLOR_OFF, COLOR_ON` swap (which cancelled the old inversion) is
   gone. **The driver patch and the lambda change land together** — either one
   alone prints a negative. Recorded in `device-client/esphome/components/PATCHES.md`.
2. **`quantizeRgbaToPalette` collapsed the whole palette to its two ends.**
   Neutral protection — gray pixels quantized against only the darkest and
   lightest inks, so text edges do not speckle red and green on Spectra 6 —
   was gated on `palette.length > 2`. Every entry of a grayscale palette is
   neutral, so every pixel was "protected" onto black or white, and the
   sixteen-level render was byte-identical to the two-level one. The gate is
   now `getHasChromaticInk`: protection applies only when some ink carries
   hue. Spectra 6 behaviour is unchanged (its tests still pass); mono and
   grayscale skip the double quantize.

**Why the same layout as mono.** Sixteen grays do not give a view a second
ink for meaning. A gray accent on a reflective panel is a weaker black, and
the 2026-09-14 record already settled that the accent ink carries emphasis.
Letting `grayscale` pick up a tone-based visual language is a separate
decision, to be made with a step wedge on the glass.

## Evidence

- Owner, this chat: *"this is good! Go ahead :)"* — after the finding above was
  laid out with the two traps.
- Before/after through the real pipeline, fixture data, in `docs/images/`
  (`2026-09-17-m5paper-*-before-1bit-960x540.png` /
  `*-after-16gray-960x540.png`): the step wedge, a sample photo, the
  clock-agenda view and the now-playing poster. Distinct values in every
  "after" PNG: `0,17,34,…,238,255` — all sixteen, none missing.
- PNG payload the ESP32 fetches, floyd-steinberg, 960x540: clock-agenda
  14.4 → 26.6 KiB, now-playing 21.5 → 51.4 KiB, photo 34.6 → 132.1 KiB, wedge
  17.0 → 22.2 KiB. Larger, because a gray PNG carries more information than a
  1-bit one; still far below the 518 KB decode buffer.
- `packages/core/src/pipeline/quantize.test.ts` — `GRAYSCALE16_PALETTE`:
  sixteen levels 17 apart, each survives `>> 4` as its own step, threshold
  lands 128 on level 136, floyd-steinberg on a flat 128 stays within levels
  119 and 136. `yarn vitest run`: 431 tests pass.
- Docket: `task_txoxpckamu54g5kg`.
