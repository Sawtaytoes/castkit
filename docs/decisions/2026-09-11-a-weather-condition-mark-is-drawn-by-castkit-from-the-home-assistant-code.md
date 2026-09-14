# A weather condition mark is drawn by CastKit from the Home Assistant code

- **Status:** Accepted
- **Date:** 2026-09-11
- **Type:** Product behavior
- **Supersedes:** —
- **Superseded by:** —

## Decision

CastKit draws a **mark** for the current weather condition — a sun, a cloud, a cloud
with rain, and so on — and it draws it from the **condition code** Home Assistant
already sends. Fifteen codes, fifteen marks, one per entry in the HA weather entity's
condition list: `clear-night`, `cloudy`, `exceptional`, `fog`, `hail`, `lightning`,
`lightning-rainy`, `partlycloudy`, `pouring`, `rainy`, `snowy`, `snowy-rainy`, `sunny`,
`windy`, `windy-variant`.

Three rules follow:

1. **The code rides with the text.** `WeatherData` carries an optional `condition`
   beside `conditionText`. The parser fills it only for a code in the list; an unknown
   string still becomes text (as before) and draws nothing. `unavailable` and
   `unknown` draw nothing, as they print nothing.
2. **A mark is stroked paths in `currentColor`, no fills, in a 24-unit box.** Feather-style
   geometry (MIT). Strokes read on the dark scheme and the light one, take the color of
   the text around them, and scale from 30 px to 96 px without a second set. Every mark
   fits inside the box: a test measures each one's bounding box, because the fog and
   windy marks first shipped clipped at the top in the mockup and the owner saw it.
3. **No emoji, no symbol font.** The same rule `Icon` records: a kiosk OS ships
   neither, and a wall display showing tofu is a display that looks broken.

Today the mark is drawn on the short landscape panel only — on the Weather view beside
the clock and on the Calendar header — because those are the layouts that were designed
with it. The square and the porthole draw no mark yet; giving them one is a layout
choice for another day, not a plumbing change.

## Context

The round-2 candidates for the short panel
([page](../previews/2026-09-11-short-panel-clock-views-round-2.html),
[the fifteen marks](../previews/2026-09-11-short-panel-clock-views-condition-marks.png))
showed the Weather view with a sun beside the clock, and the note beside it said the
app did not draw such a thing today and asked whether the marks belonged in CastKit or
in Home Assistant. The owner answered:

> "This can be part of CastKit I think since it controls the weather render view.
> There's no app we use for it. Unless you're saying Home Assistant has the images. We
> can put them there ourselves."

Home Assistant has no images to send. Its automations publish
`{ temperature, condition }` to `castkit/<id>/weather/set`, and the `condition` is the
bare code; CastKit's `parseWeatherPayload` has always turned that code into the words a
panel prints. The mark is the same mapping with a path instead of a string.

## Why

- **The renderer owns presentation.** The condition text is already CastKit's
  ("presentation is CastKit's job; HA sends the raw values", in the parser's own
  comment). A mark is presentation of the same value and lives beside the text.
- **One source, no new topic.** Keeping the code on `WeatherData` costs an optional
  field and no protocol change; a picture from HA would have meant a second payload,
  a second retained topic, and an image the ePaper dither pipeline would then have to
  learn to read.
- **Strokes over fills.** The panels are dark by default
  ([2026-09-09](2026-09-09-a-browser-panel-defaults-to-dark-and-is-read-from-across-the-room.md))
  but `Light` is a setting. A stroked mark in `currentColor` is right on both without
  a scheme-specific asset.
- **A list, not a string.** `WeatherConditionCode` is a union over HA's fifteen codes,
  so a mark missing for a code is a type error and not a blank on the panel.

## Evidence

- Owner, 2026-09-11, T3 Code chat `t3code/improve-rip-deck-small-screen-views`, quoted
  above; and after round 2: *"Icons are good, but fog and windy are cut-off at the
  top."* Both marks are re-drawn inside the box and `WeatherMark.test.tsx` measures
  every mark's bounding box against it.
- Home Assistant's condition list: the `weather` entity's documented `condition`
  states, mirrored verbatim in `WEATHER_CONDITION_CODES`
  (`packages/shared/src/viewData/types.ts`).
- Rendered:
  [weather at 480×320](../images/2026-09-11-short-panel-weather-after-2d-printer-workbench-480x320.png),
  [calendar at 480×320](../images/2026-09-11-short-panel-calendar-after-2d-printer-workbench-480x320.png)
  (fixture data: partly cloudy).
