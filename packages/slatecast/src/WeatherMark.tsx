import type { WeatherConditionCode } from "@castkit/shared/viewData/types"

/**
 * One drawn mark per Home Assistant weather condition code.
 *
 * Home Assistant sends only the code (`sunny`, `lightning-rainy`, …) and
 * CastKit already turns that into the words a panel prints; this is the same
 * mapping with a path instead of a string. Stroked, no fills, in
 * `currentColor`, so the mark reads on the dark scheme and the light one and
 * takes its colour from the text around it. Feather-style geometry (MIT), in a
 * 24-unit box.
 *
 * Same rule as `Icon`: no emoji, no symbol font — a kiosk OS ships neither,
 * and a wall display showing tofu is a display that looks broken.
 */
const CLOUD =
  "M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"
/** The rain/snow cloud: open at the bottom, so the weather can fall out of it. */
const OPEN_CLOUD =
  "M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"

const MARK_SHAPES: Record<
  WeatherConditionCode,
  readonly {
    d: string
    transform?: string
    strokeWidth?: number
  }[]
> = {
  sunny: [
    { d: "M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0z" },
    {
      d: "M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42",
    },
  ],
  "clear-night": [
    {
      d: "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z",
    },
  ],
  cloudy: [{ d: CLOUD }],
  partlycloudy: [
    {
      d: "M11.2 8a3.2 3.2 0 1 1-6.4 0 3.2 3.2 0 0 1 6.4 0z",
    },
    {
      d: "M8 1.5v1.6M1.5 8h1.6M3.4 3.4l1.1 1.1M12.6 3.4l-1.1 1.1M3.4 12.6l1.1-1.1",
    },
    {
      d: "M19.5 13.5h-.9A5.6 5.6 0 0 0 8 15.6 3.2 3.2 0 0 0 9.5 21.5h10a4 4 0 0 0 0-8z",
    },
  ],
  fog: [
    { d: CLOUD, transform: "translate(1.8 0) scale(0.85)" },
    { d: "M5 19.5h14M7 22.5h10" },
  ],
  rainy: [
    { d: OPEN_CLOUD },
    { d: "M16 13v8M8 13v8M12 15v8" },
  ],
  pouring: [
    { d: OPEN_CLOUD },
    { d: "M6 13l-1 8M10 13l-1 8M14 13l-1 8M18 13l-1 8" },
  ],
  snowy: [
    { d: OPEN_CLOUD },
    {
      d: "M8 16h.01M8 20h.01M12 18h.01M12 22h.01M16 16h.01M16 20h.01",
      strokeWidth: 3,
    },
  ],
  "snowy-rainy": [
    { d: OPEN_CLOUD },
    { d: "M8 13v8" },
    {
      d: "M12 17h.01M12 21h.01M16 15h.01M16 19h.01",
      strokeWidth: 3,
    },
  ],
  hail: [
    { d: OPEN_CLOUD },
    {
      d: "M9.4 18a1.4 1.4 0 1 1-2.8 0 1.4 1.4 0 0 1 2.8 0zM13.4 21a1.4 1.4 0 1 1-2.8 0 1.4 1.4 0 0 1 2.8 0zM17.4 18a1.4 1.4 0 1 1-2.8 0 1.4 1.4 0 0 1 2.8 0z",
    },
  ],
  lightning: [
    {
      d: "M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9",
    },
    { d: "M13 11l-4 6h6l-4 6" },
  ],
  "lightning-rainy": [
    {
      d: "M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9",
    },
    { d: "M13 11l-4 6h6l-4 6M5.5 15v5M19 16v5" },
  ],
  windy: [
    {
      d: "M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2",
    },
  ],
  "windy-variant": [
    { d: CLOUD, transform: "translate(3 0) scale(0.75)" },
    {
      d: "M3 17.5h11a2 2 0 1 1-2 2M3 21.5h7a1.6 1.6 0 1 0-1.6-1.6",
    },
  ],
  exceptional: [
    {
      d: "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z",
    },
    { d: "M12 9v4M12 17h.01", strokeWidth: 2.6 },
  ],
}

export const WeatherMark = ({
  condition,
  class: className = "weather-mark",
}: {
  condition: WeatherConditionCode
  class?: string
}) => (
  <svg
    class={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    data-condition={condition}
  >
    {MARK_SHAPES[condition].map((shape) => (
      <path
        key={shape.d}
        d={shape.d}
        transform={shape.transform}
        stroke-width={shape.strokeWidth}
      />
    ))}
  </svg>
)
