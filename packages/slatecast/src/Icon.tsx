/**
 * Inline SVG icons.
 *
 * Emoji and symbol glyphs render as tofu on minimal kiosk OS fonts — WPE and
 * cage ship no emoji font, and a wall display showing an empty box is a
 * display that looks broken from across the room. So every mark this app draws
 * is a path it owns.
 *
 * That rule was already in `NowPlaying`, applied to the transport controls,
 * and two placeholders still spelled `♪` as text. Lifted here so the rule has
 * one home and the placeholders can obey it too — the same reasoning
 * `@charcuterie/ui` records for shipping no glyph defaults.
 */

export const ICON_PATHS = {
  chevronLeft: "M16 2 6 12l10 10 2-2-8-8 8-8-2-2z",
  previous: "M6 6h2v12H6V6zm12 0v12l-8.5-6L18 6z",
  play: "M8 5v14l11-7L8 5z",
  pause: "M6 5h4v14H6V5zm8 0h4v14h-4V5z",
  stop: "M5 5h14v14H5z",
  next: "M16 6h2v12h-2V6zM6 6l8.5 6L6 18V6z",
  volume:
    "M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z",
  muted:
    "M3 9v6h4l5 5V4L7 9H3zm18.6 6.7-1.4 1.4L17 13.9l-3.2 3.2-1.4-1.4 3.2-3.2-3.2-3.2 1.4-1.4L17 11.1l3.2-3.2 1.4 1.4-3.2 3.2 3.2 3.2z",
  /** Stands in for missing album art. */
  note: "M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z",
  favorite:
    "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z",
  favoriteOutline:
    "M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z",
  shuffle:
    "M10.59 9.17 5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z",
  repeat:
    "M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z",
  repeatOne:
    "M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2V9h-1l-2 1v1h1.5v4H13z",
  speakers:
    "M18.2 1H9.8C8.81 1 8 1.81 8 2.8v14.4c0 .99.81 1.79 1.8 1.79l8.4.01c.99 0 1.8-.81 1.8-1.8V2.8c0-.99-.81-1.8-1.8-1.8zM14 3c1.1 0 2 .89 2 2s-.9 2-2 2-2-.89-2-2 .9-2 2-2zm0 13.5c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm0-6.5c-1.38 0-2.5 1.12-2.5 2.5S12.62 15 14 15s2.5-1.12 2.5-2.5S15.38 10 14 10zm-8-5H4v16c0 1.1.89 2 2 2h10v-2H6V5z",
  check:
    "M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
} as const

export const Icon = ({
  path,
  size = "1em",
}: {
  path: string
  size?: string
}) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="currentColor"
    aria-hidden="true"
  >
    <path d={path} />
  </svg>
)
